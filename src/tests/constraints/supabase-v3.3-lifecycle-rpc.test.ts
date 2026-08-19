import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase-v3.3-lifecycle-rpc.sql"),
  "utf8",
);

function functionBody(schema: "public" | "private", name: string): string {
  const match = sql.match(
    new RegExp(
      `create or replace function ${schema}\\.${name}\\([\\s\\S]*?\\)\\s*returns[\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`,
      "i",
    ),
  );
  expect(match, `Missing SQL function ${schema}.${name}`).not.toBeNull();
  return match?.[1] ?? "";
}

function functionHeader(name: string): string {
  const match = sql.match(
    new RegExp(
      `create or replace function public\\.${name}\\(([\\s\\S]*?)\\)\\s*returns`,
      "i",
    ),
  );
  expect(match, `Missing SQL function public.${name}`).not.toBeNull();
  return match?.[1] ?? "";
}

describe("Supabase v3.3 lifecycle RPC boundary", () => {
  it("derives every actor from auth.uid and exposes no actor-id parameters", () => {
    for (const name of [
      "join_program",
      "cancel_own_participation",
      "confirm_participation_payment",
      "set_program_status",
      "create_program_record",
      "update_program_record",
    ]) {
      expect(functionHeader(name)).not.toMatch(/(?:actor|user|author)_id/i);
      expect(functionBody("public", name)).toMatch(/auth\.uid\(\)/i);
      expect(sql).toMatch(
        new RegExp(
          `create or replace function public\\.${name}[\\s\\S]*?security definer[\\s\\S]*?set search_path = ''`,
          "i",
        ),
      );
    }
  });

  it("serializes JOIN on the Program row and derives placement and payment", () => {
    const body = functionBody("public", "join_program");

    expect(body).toMatch(/from public\.programs[\s\S]*for update/i);
    expect(body).toMatch(/v_actor_status <> 'MEMBER'/i);
    expect(body).toMatch(/v_program\.status <> 'OPEN'/i);
    expect(body).toMatch(/v_program\.start_at <= v_joined_at/i);
    expect(body).toMatch(/recruitment_deadline[\s\S]*v_joined_at > detail\.recruitment_deadline/i);
    expect(body).toMatch(/program_has_published_version\(p_program_id\)/i);
    expect(body).toMatch(/status = 'CONFIRMED'/i);
    expect(body).toMatch(/v_waitlist_enabled/i);
    expect(body).toMatch(/v_cost_type = 'HOST_COLLECT'[\s\S]*'PENDING'/i);
    expect(body).toMatch(/v_existing\.status <> 'CANCELLED'/i);
    expect(body).toMatch(/'JOINED'::public\.program_activity_type/i);
    expect(body).toMatch(/'WAITLISTED'::public\.program_activity_type/i);
  });

  it("cancels only auth.uid before start and keeps a repeatable audit trail", () => {
    const body = functionBody("public", "cancel_own_participation");

    expect(body).toMatch(/participation\.user_id = v_actor_id/i);
    expect(body).toMatch(/from public\.programs[\s\S]*for update/i);
    expect(body).toMatch(/from public\.participations[\s\S]*for update/i);
    expect(body).toMatch(/v_program\.status in \('COMPLETED', 'CANCELLED'\)/i);
    expect(body).toMatch(/v_program\.start_at <= v_cancelled_at/i);
    expect(body).toMatch(/set status = 'CANCELLED',[\s\S]*updated_at = v_cancelled_at/i);
    expect(body).toMatch(/'previousStatus'/i);
    expect(body).toMatch(/'LEFT:'[\s\S]*v_cancelled_at::text/i);
  });

  it("lets only Host/Admin confirm HOST_COLLECT payment for a confirmed member", () => {
    const body = functionBody("public", "confirm_participation_payment");

    expect(body).toMatch(/v_actor_status = 'ADMIN' or v_program\.host_id = v_actor_id/i);
    expect(body).toMatch(/v_program\.type <> 'GATHERING'/i);
    expect(body).toMatch(/v_cost_type <> 'HOST_COLLECT'/i);
    expect(body).toMatch(/v_participation\.status <> 'CONFIRMED'/i);
    expect(body).toMatch(/payment_status = 'PAID'/i);
    expect(body).toMatch(/'PAYMENT_CONFIRMED:'/i);
  });

  it("guards the effective Program state graph and Admin-only publication", () => {
    const body = functionBody("public", "set_program_status");

    expect(body).toMatch(/v_program\.status = 'DRAFT' and p_status = 'OPEN'/i);
    expect(body).toMatch(/v_program\.status = 'OPEN'[\s\S]*'CLOSED', 'COMPLETED', 'CANCELLED'/i);
    expect(body).toMatch(/v_program\.status = 'CLOSED'[\s\S]*'OPEN', 'COMPLETED', 'CANCELLED'/i);
    expect(body).toMatch(/p_status = 'OPEN' and v_actor_status <> 'ADMIN'/i);
    expect(body).toMatch(/program_has_published_version\(p_program_id\)/i);
    expect(body).toMatch(/then 'COMPLETED'::public\.program_activity_type/i);
  });

  it("creates and updates completed Records with atomic material replacement", () => {
    const createBody = functionBody("public", "create_program_record");
    const updateBody = functionBody("public", "update_program_record");
    const materialsBody = functionBody("private", "oa_replace_record_materials");

    expect(createBody).toMatch(/v_program\.status <> 'COMPLETED'/i);
    expect(createBody).toMatch(/v_program\.host_id = v_actor_id/i);
    expect(createBody).toMatch(/raise exception 'RECORD_ALREADY_EXISTS'/i);
    expect(createBody).toMatch(/private\.oa_replace_record_materials/i);
    expect(createBody).toMatch(/'RECORD_CREATED:'/i);

    expect(updateBody).toMatch(/from public\.records[\s\S]*for update/i);
    expect(updateBody).toMatch(/v_record\.author_id = v_actor_id/i);
    expect(updateBody).toMatch(/private\.oa_replace_record_materials/i);
    expect(updateBody).toMatch(/'scope', 'RECORD'/i);

    expect(materialsBody).toMatch(/jsonb_typeof\(v_materials\) <> 'array'/i);
    expect(materialsBody).toMatch(/delete from public\.record_materials/i);
    expect(materialsBody).toMatch(/v_type = 'PHOTO'/i);
    expect(materialsBody).toMatch(/v_type in \('LINK', 'REFERENCE'\)/i);
    expect(materialsBody).toMatch(/insert into public\.record_materials/i);
  });

  it("keeps direct lifecycle writes revoked and grants RPCs only to authenticated", () => {
    for (const table of [
      "programs",
      "participations",
      "records",
      "record_materials",
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `revoke insert, update, delete, truncate on public\\.${table} from anon, authenticated`,
          "i",
        ),
      );
    }

    expect(sql).toMatch(
      /revoke all on function private\.oa_replace_record_materials\(uuid, jsonb\)[\s\S]*from public, anon, authenticated/i,
    );
    expect(sql).not.toMatch(/grant execute[\s\S]*\bto anon\b/i);
    expect(sql.match(/grant execute on function public\./gi)).toHaveLength(6);
  });
});
