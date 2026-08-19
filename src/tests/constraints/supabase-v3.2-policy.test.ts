import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase-v3.2.sql"), "utf8");

function functionBody(name: string): string {
  const match = sql.match(
    new RegExp(
      `create or replace function public\\.${name}\\([\\s\\S]*?\\)\\s*returns[\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`,
      "i",
    ),
  );
  expect(match, `Missing SQL function ${name}`).not.toBeNull();
  return match?.[1] ?? "";
}

describe("Supabase v3.2 material revision blueprint", () => {
  it("stores a typed JSONB revision separately from the published Program", () => {
    expect(sql).toMatch(
      /alter table public\.program_approvals[\s\S]*add column if not exists published_at timestamptz/i,
    );
    expect(sql).toMatch(/create table if not exists public\.program_revisions/i);
    expect(sql).toMatch(/proposed_snapshot jsonb not null/i);
    expect(sql).toMatch(/changed_fields text\[\] not null/i);
    expect(sql).toMatch(/jsonb_typeof\(proposed_snapshot\) = 'object'/i);
    for (const field of [
      "startAt",
      "endAt",
      "location",
      "costType",
      "participationFee",
      "paymentInfo",
      "cancellationPolicy",
    ]) {
      expect(sql).toContain(`'${field}'`);
    }
  });

  it("allows revision reads only to its owner, Host, or Admin and blocks direct writes", () => {
    expect(sql).toMatch(/alter table public\.program_revisions enable row level security/i);
    expect(sql).toMatch(/revision visible to requester host or admin/i);
    expect(sql).toMatch(/proposed_by = auth\.uid\(\)/i);
    expect(sql).toMatch(/programs\.host_id = auth\.uid\(\)/i);
    expect(sql).toMatch(/public\.is_oa_admin\(\)/i);
    expect(sql).toMatch(
      /revoke insert, update, delete on public\.program_revisions from anon, authenticated/i,
    );
    expect(sql).toMatch(
      /revoke update on public\.program_approvals from anon, authenticated/i,
    );
  });

  it("submits a material revision while preserving published_at and the Program row", () => {
    const body = functionBody("submit_program_revision");
    expect(body).toMatch(/from public\.programs[\s\S]*for update/i);
    expect(body).toMatch(/from public\.program_approvals[\s\S]*for update/i);
    expect(body).toMatch(/approval\.published_at is null/i);
    expect(body).toMatch(/insert into public\.program_revisions/i);
    expect(body).toMatch(/on conflict \(program_id\) do update/i);
    expect(body).toMatch(
      /update public\.program_approvals[\s\S]*set status = 'PENDING'/i,
    );
    expect(body).not.toMatch(/^\s*update public\.programs/im);
  });

  it("promotes only APPROVED revisions inside one guarded transaction", () => {
    const body = functionBody("review_program_revision");
    expect(body).toMatch(/if not public\.is_oa_admin\(\)/i);
    expect(body).toMatch(/from public\.program_approvals[\s\S]*for update/i);
    expect(body).toMatch(/from public\.program_revisions[\s\S]*for update/i);
    expect(body).toMatch(/from public\.programs where id = p_program_id for update/i);
    expect(body).toMatch(
      /if p_decision = 'APPROVED' then[\s\S]*to_regprocedure\([\s\S]*apply_program_revision_snapshot\(uuid,jsonb\)/i,
    );
    expect(body).toMatch(/raise exception 'REVISION_APPLY_ADAPTER_REQUIRED'/i);
    expect(body).toMatch(
      /execute 'select public\.apply_program_revision_snapshot\(\$1, \$2\)'/i,
    );
    expect(body).not.toMatch(/^\s*update public\.programs/im);

    const applyAt = body.indexOf("apply_program_revision_snapshot($1, $2)");
    const approvalAt = body.indexOf("update public.program_approvals");
    const deleteAt = body.indexOf("delete from public.program_revisions");
    expect(applyAt).toBeGreaterThan(-1);
    expect(approvalAt).toBeGreaterThan(applyAt);
    expect(deleteAt).toBeGreaterThan(approvalAt);
  });

  it("retains the public row for CHANGES_REQUESTED or REJECTED", () => {
    const body = functionBody("review_program_revision");
    expect(body).toMatch(/p_decision = 'CHANGES_REQUESTED'[\s\S]*REVIEW_COMMENT_REQUIRED/i);
    expect(body).toMatch(
      /if p_decision = 'APPROVED' then[\s\S]*delete from public\.program_revisions/i,
    );
    expect(body).toContain(
      "CHANGES_REQUESTED and REJECTED intentionally retain the revision",
    );
    expect(body).not.toMatch(/set status = 'DRAFT'/i);
  });

  it("prevents the initial approval RPC from bypassing revision promotion", () => {
    const body = functionBody("review_program_approval");
    expect(body).toMatch(/from public\.program_revisions/i);
    expect(body).toMatch(/raise exception 'REVISION_REVIEW_REQUIRED'/i);
    expect(body).toMatch(
      /when p_decision = 'APPROVED' then decision_at[\s\S]*else published_at/i,
    );
  });

  it("limits ordinary participant TALK access to published operational states", () => {
    const readBody = functionBody("can_read_program_talk");
    const writeBody = functionBody("can_write_program_talk");

    expect(readBody).toMatch(
      /programs\.status in \('OPEN', 'CLOSED', 'COMPLETED', 'CANCELLED'\)/i,
    );
    expect(readBody).toMatch(/public\.program_has_published_version\(p_program_id\)/i);
    expect(readBody).toMatch(
      /participations\.status in \('CONFIRMED', 'CANCELLED'\)/i,
    );

    expect(writeBody).toMatch(
      /programs\.status in \('OPEN', 'CLOSED', 'COMPLETED'\)/i,
    );
    expect(writeBody).toMatch(/programs\.status <> 'CANCELLED'/i);
    expect(writeBody).toMatch(/public\.program_has_published_version\(p_program_id\)/i);
    expect(writeBody).toMatch(/participations\.status = 'CONFIRMED'/i);
  });

  it("does not guess uncommitted GatheringDetail storage columns", () => {
    expect(sql).not.toMatch(/update public\.gathering_details/i);
    expect(sql).toContain("REVISION_APPLY_ADAPTER_REQUIRED");
    expect(sql).toContain(
      "public.apply_program_revision_snapshot(uuid, jsonb)",
    );
  });
});
