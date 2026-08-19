import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase-v3.3-revision-apply.sql"),
  "utf8",
);
const talkSql = readFileSync(
  resolve(process.cwd(), "supabase-v3.3-talk-realtime.sql"),
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

describe("Supabase v3.3 Gathering revision apply adapter", () => {
  it("documents the executable migration order before TALK Realtime", () => {
    expect(sql).toMatch(
      /supabase-v3\.2\.sql[\s\S]*supabase-v3\.3-revision-apply\.sql[\s\S]*supabase-v3\.3-talk-realtime\.sql/i,
    );
    expect(talkSql).toMatch(
      /supabase-v3\.2\.sql -> supabase-v3\.3-revision-apply\.sql/i,
    );
  });

  it("validates and normalizes the complete typed Gathering snapshot", () => {
    const body = functionBody(
      "private",
      "oa_normalize_gathering_revision_snapshot",
    );

    for (const field of [
      "title",
      "description",
      "startAt",
      "endAt",
      "location",
      "mapUrl",
      "capacity",
      "category",
      "meetingPoint",
      "recruitmentDeadline",
      "waitlistEnabled",
      "bringItems",
      "notice",
    ]) {
      expect(body).toContain(`'${field}'`);
    }
    expect(body).toMatch(/REVISION_SYSTEM_FIELD_MISMATCH/i);
    expect(body).toMatch(/\^https\?:\/\/\[\^\[:space:\]\]\+\$/i);
    expect(body).toMatch(/proposed_end_at <= proposed_start_at/i);
    expect(body).toMatch(
      /proposed_recruitment_deadline > proposed_start_at/i,
    );
  });

  it("enforces each cost union without mixing payment payloads", () => {
    const body = functionBody(
      "private",
      "oa_normalize_gathering_revision_snapshot",
    );

    expect(body).toMatch(/proposed_cost_type = 'FREE'/i);
    expect(body).toMatch(/proposed_cost_type = 'INDIVIDUAL_PURCHASE'/i);
    expect(body).toMatch(/INVALID_REVISION_HOST_COLLECT_COST/i);
    expect(body).toMatch(/proposed_participation_fee <= 0/i);
    expect(body).toMatch(/INVALID_REVISION_PURCHASE_URL/i);
    expect(body).toMatch(/proposed_payment_deadline > proposed_start_at/i);
    expect(body).toMatch(/nullif\(btrim\(cost ->> 'paymentInfo'\), ''\) is null/i);
  });

  it("derives material fields from locked database state, never client claims", () => {
    const deriveBody = functionBody(
      "private",
      "oa_material_gathering_revision_fields",
    );
    const submitBody = functionBody("public", "submit_program_revision");

    for (const field of [
      "startAt",
      "endAt",
      "location",
      "costType",
      "participationFee",
      "paymentInfo",
      "cancellationPolicy",
    ]) {
      expect(deriveBody).toContain(`'${field}'`);
    }
    expect(submitBody).toMatch(
      /derived_changed_fields := private\.oa_material_gathering_revision_fields/i,
    );
    expect(submitBody).toMatch(/changed_fields[\s\S]*derived_changed_fields/i);
    expect(submitBody).toMatch(/to_jsonb\(derived_changed_fields\)/i);
    expect(submitBody).not.toMatch(/p_changed_fields/i);
  });

  it("promotes all editable rows inside the review transaction", () => {
    const body = functionBody("public", "apply_program_revision_snapshot");

    expect(body).toMatch(/from public\.programs[\s\S]*for update/i);
    expect(body).toMatch(/from public\.gathering_details[\s\S]*for update/i);
    expect(body).toMatch(/from public\.program_revisions[\s\S]*for update/i);
    expect(body).toMatch(/update public\.programs/i);
    expect(body).toMatch(/update public\.gathering_details/i);
    expect(body).toMatch(
      /insert into public\.gathering_payment_instructions[\s\S]*on conflict \(program_id\) do update/i,
    );
    expect(body).toMatch(
      /delete from public\.gathering_payment_instructions/i,
    );
    expect(body).toMatch(/REVISION_CHANGED_FIELDS_MISMATCH/i);
    expect(body).not.toMatch(/set[\s\S]*host_id\s*=/i);
    expect(body).not.toMatch(/set[\s\S]*status\s*=/i);
  });

  it("keeps the internal apply path unavailable to member clients", () => {
    expect(sql).toMatch(
      /revoke all on function public\.apply_program_revision_snapshot\(uuid, jsonb\)[\s\S]*from public, anon, authenticated/i,
    );
    expect(sql).not.toMatch(
      /grant execute on function public\.apply_program_revision_snapshot/i,
    );
  });

  it("does not introduce forbidden product models", () => {
    for (const table of [
      "collectives",
      "workshops",
      "direct_messages",
      "payment_transactions",
      "program_sessions",
      "posts",
      "likes",
      "follows",
    ]) {
      expect(sql).not.toMatch(
        new RegExp(`create table(?: if not exists)? public\\.${table}\\b`, "i"),
      );
    }
  });
});
