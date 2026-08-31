import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase-v3.4-admin-operations.sql"),
  "utf8",
);

function functionDefinition(name: string): string {
  const match = sql.match(
    new RegExp(
      `create or replace function public\\.${name}\\([^)]*\\)[\\s\\S]*?\\n\\$\\$;`,
      "i",
    ),
  );
  expect(match, `${name} definition`).not.toBeNull();
  return match?.[0] ?? "";
}

describe("v3.4 Admin operations", () => {
  it("hardens the public Admin compatibility helper", () => {
    const helper = functionDefinition("is_oa_admin");

    expect(helper).toMatch(/security definer/i);
    expect(helper).toMatch(/set search_path = ''/i);
    expect(helper).toMatch(/select private\.oa_is_admin\(\)/i);
    expect(sql).toMatch(
      /revoke all on function public\.is_oa_admin\(\)[\s\S]*from public, anon, authenticated/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.is_oa_admin\(\)[\s\S]*to anon, authenticated/i,
    );
  });

  it("keeps both Admin RPCs hardened and derives identity from auth.uid()", () => {
    const inventory = functionDefinition("list_admin_member_registrations");
    const approval = functionDefinition("approve_pending_member");

    for (const definition of [inventory, approval]) {
      expect(definition).toMatch(/security definer/i);
      expect(definition).toMatch(/set search_path = ''/i);
      expect(definition).toMatch(/auth\.uid\(\) is null/i);
      expect(definition).toMatch(/not private\.oa_is_admin\(\)/i);
    }

    expect(sql).not.toMatch(/p_(?:admin|actor|viewer)_id/i);
  });

  it("locks the member row and permits only PENDING to MEMBER", () => {
    const approval = functionDefinition("approve_pending_member");

    expect(approval).toMatch(/select u\.status[\s\S]*for update/i);
    expect(approval).toMatch(
      /current_status <> 'PENDING'::public\.user_status/i,
    );
    expect(approval).toMatch(/status = 'MEMBER'::public\.user_status/i);
    expect(approval).not.toMatch(/status = 'ADMIN'/i);
  });

  it("requires and locks at least one Membership before approval", () => {
    const approval = functionDefinition("approve_pending_member");

    expect(approval).toMatch(
      /perform 1[\s\S]*from public\.memberships as m[\s\S]*where m\.user_id = p_user_id[\s\S]*for key share;/i,
    );
    expect(approval).toMatch(
      /for key share;\s*if not found then\s*raise exception[\s\S]*message = 'MEMBERSHIP_REQUIRED';[\s\S]*update public\.users/i,
    );
  });

  it("revokes function defaults and grants execution only to authenticated", () => {
    for (const signature of [
      "list_admin_member_registrations\\(\\)",
      "approve_pending_member\\(uuid\\)",
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `revoke all on function public\\.${signature}[\\s\\S]*?from public, anon, authenticated`,
          "i",
        ),
      );
      expect(sql).toMatch(
        new RegExp(
          `grant execute on function public\\.${signature}[\\s\\S]*?to authenticated`,
          "i",
        ),
      );
    }
  });

  it("makes delta-table reads deterministic without reopening RPC-owned writes", () => {
    expect(sql).toMatch(
      /revoke all privileges on table[\s\S]*public\.program_approvals[\s\S]*public\.program_revisions[\s\S]*from public, anon, authenticated/i,
    );
    expect(sql).toMatch(
      /grant select on table public\.records, public\.record_materials[\s\S]*to anon, authenticated/i,
    );
    expect(sql).toMatch(
      /grant update \(title, headline, description, empty_state, updated_by\)[\s\S]*public\.page_content to authenticated/i,
    );
    expect(sql).not.toMatch(
      /grant\s+(?:insert|update|delete)(?:\s*\([^)]*\))?\s+on\s+table\s+public\.(?:program_approvals|program_activities|records|record_materials|program_revisions)/i,
    );
  });
});
