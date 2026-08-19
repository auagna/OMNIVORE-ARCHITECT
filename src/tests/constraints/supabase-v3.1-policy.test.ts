import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase-v3.1.sql"), "utf8");

describe("Supabase v3.1 lifecycle policy", () => {
  it("keeps ProgramActivity as a protected internal audit log", () => {
    expect(sql).toContain("create table if not exists public.program_activities");
    expect(sql).toContain("alter table public.program_activities enable row level security");
    expect(sql).toContain(
      "revoke insert, update, delete on public.program_activities from anon, authenticated",
    );
    expect(sql).not.toMatch(/activity_feed/i);
  });

  it("declares the exact initial activity vocabulary", () => {
    for (const type of [
      "CREATED",
      "SUBMITTED",
      "APPROVED",
      "CHANGES_REQUESTED",
      "REJECTED",
      "UPDATED",
      "JOINED",
      "LEFT",
      "WAITLISTED",
      "PAYMENT_CONFIRMED",
      "NOTICE_POSTED",
      "COMPLETED",
      "RECORD_CREATED",
    ]) {
      expect(sql).toContain(`'${type}'`);
    }
  });

  it("models WHAT-first Records and separately protected materials", () => {
    expect(sql).toContain("what text not null");
    expect(sql).toContain("create table if not exists public.record_materials");
    expect(sql).toContain("alter table public.records enable row level security");
    expect(sql).toContain("alter table public.record_materials enable row level security");
    expect(sql).toContain("programs.status = 'COMPLETED'");
  });

  it("enforces TALK read/write and Notice capability in RLS", () => {
    expect(sql).toContain("public.can_read_program_talk(program_id)");
    expect(sql).toContain("public.can_write_program_talk(program_id)");
    expect(sql).toContain("public.can_write_program_notice(program_id)");
    expect(sql).toContain("participations.status in ('CONFIRMED', 'CANCELLED')");
    expect(sql).toContain("participations.status = 'CONFIRMED'");
    expect(sql).toContain("programs.status <> 'CANCELLED'");
  });

  it("cancels only the caller's Participation through a guarded RPC", () => {
    expect(sql).toContain("public.cancel_own_participation");
    expect(sql).toContain("user_id = auth.uid()");
    expect(sql).toContain("current_program.start_at <= now()");
    expect(sql).toContain("'LEFT:' || current_participation.id::text");
  });
});
