import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase-v3.3-gathering-write-rpc.sql"),
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

describe("Supabase v3.3 Gathering write RPC boundary", () => {
  it("publishes four JSON RPCs without client actor or changed-field inputs", () => {
    expect(functionHeader("create_gathering_proposal")).toMatch(/p_snapshot jsonb/i);
    expect(functionHeader("resubmit_gathering_proposal")).toMatch(
      /p_program_id uuid[\s\S]*p_snapshot jsonb/i,
    );
    expect(functionHeader("publish_gathering")).toMatch(/p_snapshot jsonb/i);
    expect(functionHeader("update_gathering")).toMatch(
      /p_program_id uuid[\s\S]*p_snapshot jsonb/i,
    );

    for (const name of [
      "create_gathering_proposal",
      "resubmit_gathering_proposal",
      "publish_gathering",
      "update_gathering",
    ]) {
      expect(functionHeader(name)).not.toMatch(/(?:actor|user|requester)_id/i);
      expect(functionHeader(name)).not.toMatch(/changed_fields/i);
      expect(functionBody("public", name)).toMatch(/auth\.uid\(\)/i);
      expect(sql).toMatch(
        new RegExp(
          `create or replace function public\\.${name}[\\s\\S]*?security definer[\\s\\S]*?set search_path = ''`,
          "i",
        ),
      );
    }
  });

  it("accepts only the exact CreateGatheringInput JSON shape", () => {
    const body = functionBody("private", "oa_gathering_input_snapshot");
    for (const field of [
      "title",
      "category",
      "description",
      "startAt",
      "endAt",
      "location",
      "meetingPoint",
      "mapUrl",
      "capacity",
      "recruitmentDeadline",
      "waitlistEnabled",
      "cost",
      "bringItems",
      "notice",
    ]) {
      expect(body).toContain(`'${field}'`);
    }
    expect(body).toMatch(/jsonb_object_keys\(p_snapshot\)/i);
    expect(body).toMatch(/'hostId', v_program\.host_id/i);
    expect(body).toMatch(/'status', v_program\.status::text/i);
    expect(body).toMatch(/'createdAt', v_program\.created_at/i);
    expect(body).not.toMatch(/p_snapshot -> 'hostId'/i);
    expect(body).not.toMatch(/p_snapshot -> 'status'/i);
  });

  it("allocates collision-safe OA Gathering codes and normalizes before storing", () => {
    expect(sql).toMatch(/create sequence if not exists private\.oa_gathering_code_seq/i);
    expect(sql).toMatch(/substring\(program\.code from '\^OA \/ G\(\[0-9\]\+\)\$'\)/i);

    const body = functionBody("private", "oa_create_gathering_program");
    expect(body).toMatch(/nextval\('private\.oa_gathering_code_seq'::regclass\)/i);
    expect(body).toMatch(/'OA \/ G' \|\| lpad/i);
    expect(body).toMatch(/insert into public\.programs/i);
    expect(body).toMatch(/private\.oa_normalize_gathering_revision_snapshot/i);
    expect(body).toMatch(/private\.oa_store_gathering_snapshot/i);
  });

  it("creates a Member proposal and restricted payment data atomically", () => {
    const proposalBody = functionBody("public", "create_gathering_proposal");
    const storeBody = functionBody("private", "oa_store_gathering_snapshot");

    expect(proposalBody).toMatch(/v_actor_status <> 'MEMBER'/i);
    expect(proposalBody).toMatch(/oa_create_gathering_program\('DRAFT', p_snapshot\)/i);
    expect(proposalBody).toMatch(/insert into public\.program_approvals/i);
    expect(proposalBody).toMatch(/'PENDING'/i);
    expect(proposalBody).toMatch(/'CREATED'[\s\S]*'SUBMITTED'/i);

    expect(storeBody).toMatch(/insert into public\.gathering_details/i);
    expect(storeBody).toMatch(/on conflict \(program_id\) do update/i);
    expect(storeBody).toMatch(/v_cost ->> 'type' = 'HOST_COLLECT'/i);
    expect(storeBody).toMatch(/insert into public\.gathering_payment_instructions/i);
    expect(storeBody).toMatch(/else[\s\S]*delete from public\.gathering_payment_instructions/i);
  });

  it("resubmits only the owner/requester and separates initial from published revisions", () => {
    const body = functionBody("public", "resubmit_gathering_proposal");

    expect(body).toMatch(/from public\.program_approvals[\s\S]*for update/i);
    expect(body).toMatch(/from public\.programs[\s\S]*for update/i);
    expect(body).toMatch(/v_program\.host_id <> v_actor_id/i);
    expect(body).toMatch(/v_approval\.requester_id <> v_actor_id/i);
    expect(body).toMatch(/v_approval\.status <> 'CHANGES_REQUESTED'/i);
    expect(body).toMatch(/if v_approval\.published_at is null then/i);
    expect(body).toMatch(/oa_store_gathering_snapshot/i);
    expect(body).toMatch(/set status = 'PENDING'/i);
    expect(body).toMatch(/else[\s\S]*public\.submit_program_revision/i);
  });

  it("allows only Admin direct OPEN publication with NOT_REQUIRED approval", () => {
    const body = functionBody("public", "publish_gathering");

    expect(body).toMatch(/if not public\.is_oa_admin\(\)/i);
    expect(body).toMatch(/oa_create_gathering_program\('OPEN', p_snapshot\)/i);
    expect(body).toMatch(/insert into public\.program_approvals/i);
    expect(body).toMatch(/'NOT_REQUIRED'/i);
    expect(body).toMatch(/v_published_at/i);
    expect(body).toMatch(/'source', 'ADMIN_DIRECT'/i);
  });

  it("derives edit classification and routes APPROVED material changes to revision", () => {
    const body = functionBody("public", "update_gathering");
    const operationalBody = functionBody(
      "private",
      "oa_operational_gathering_fields",
    );

    expect(body).toMatch(/v_approval\.status not in \('APPROVED', 'NOT_REQUIRED'\)/i);
    expect(body).toMatch(/oa_material_gathering_revision_fields/i);
    expect(body).toMatch(/oa_operational_gathering_fields/i);
    expect(body).toMatch(/v_changed_fields := v_material_fields \|\| v_operational_fields/i);
    expect(body).toMatch(
      /cardinality\(v_material_fields\) > 0[\s\S]*v_approval\.status = 'APPROVED'[\s\S]*submit_program_revision/i,
    );
    expect(body).toMatch(/oa_store_gathering_snapshot/i);
    expect(body).toMatch(/'changedFields', to_jsonb\(v_changed_fields\)/i);

    for (const field of [
      "title",
      "category",
      "description",
      "meetingPoint",
      "mapUrl",
      "capacity",
      "recruitmentDeadline",
      "waitlistEnabled",
      "bringItems",
      "notice",
      "estimatedPrice",
      "purchaseUrl",
      "purchaseNote",
      "feeIncludes",
      "paymentDeadline",
    ]) {
      expect(operationalBody).toContain(`'${field}'`);
    }
  });

  it("keeps helpers private and grants only the four RPCs to authenticated", () => {
    for (const helper of [
      "oa_gathering_input_snapshot",
      "oa_operational_gathering_fields",
      "oa_store_gathering_snapshot",
      "oa_create_gathering_program",
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `revoke all on function private\\.${helper}[\\s\\S]*?from public, anon, authenticated`,
          "i",
        ),
      );
    }
    expect(sql).not.toMatch(/grant execute[\s\S]*\bto anon\b/i);
    expect(sql.match(/grant execute on function public\./gi)).toHaveLength(4);
  });
});
