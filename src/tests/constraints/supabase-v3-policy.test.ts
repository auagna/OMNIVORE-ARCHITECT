import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase-v3.sql"), "utf8");

describe("Supabase v3 authorization contract", () => {
  it("enables RLS for approvals and editable page content", () => {
    expect(sql).toMatch(/alter table public\.program_approvals enable row level security/i);
    expect(sql).toMatch(/alter table public\.page_content enable row level security/i);
  });

  it("keeps approval review admin-only and requires revision comments", () => {
    expect(sql).toMatch(/admin reviews approvals/i);
    expect(sql).toMatch(/if not public\.is_oa_admin\(\)/i);
    expect(sql).toMatch(
      /p_decision = 'CHANGES_REQUESTED'[\s\S]*nullif\(btrim\(p_comment\)/i,
    );
  });

  it("publishes a Program only inside the approval transaction", () => {
    expect(sql).toMatch(/create or replace function public\.review_program_approval/i);
    expect(sql).toMatch(/p_decision = 'APPROVED'[\s\S]*set status = 'OPEN'/i);
  });

  it("allows public content reads but limits writes to admins", () => {
    expect(sql).toMatch(/page content is public/i);
    expect(sql).toMatch(/admin updates page content/i);
    expect(sql).toMatch(/with check \(public\.is_oa_admin\(\) and updated_by = auth\.uid\(\)\)/i);
  });
});
