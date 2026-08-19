import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const base = readFileSync(
  resolve(process.cwd(), "supabase-v3.3-base.sql"),
  "utf8",
);
const talk = readFileSync(
  resolve(process.cwd(), "supabase-v3.3-talk-realtime.sql"),
  "utf8",
);

describe("Supabase v3.3 executable foundation", () => {
  it("declares only the three top-level Program types", () => {
    expect(base).toMatch(
      /create type public\.program_type as enum\s*\(\s*'TALK',\s*'READING',\s*'GATHERING'\s*\)/i,
    );
    expect(base).not.toMatch(/program_type[^;]*'WORKSHOP'/i);
    expect(base).not.toMatch(/program_type[^;]*'COLLECTIVE'/i);
    expect(base).toMatch(/gathering_category[^;]*'WORKSHOP'/i);
  });

  it("creates the complete core model before the v3 deltas", () => {
    for (const table of [
      "users",
      "seasons",
      "memberships",
      "programs",
      "gathering_details",
      "talk_details",
      "reading_details",
      "participations",
      "media",
      "program_messages",
      "message_reads",
      "tags",
      "program_tags",
    ]) {
      expect(base).toMatch(
        new RegExp(`create table(?: if not exists)? public\\.${table}\\b`, "i"),
      );
    }
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
      expect(base).not.toMatch(
        new RegExp(`create table(?: if not exists)? public\\.${table}\\b`, "i"),
      );
    }
  });

  it("physically separates Host payment instructions from public Gathering data", () => {
    expect(base).toMatch(
      /create table(?: if not exists)? public\.gathering_payment_instructions\b/i,
    );
    const gatheringDetail = base.match(
      /create table(?: if not exists)? public\.gathering_details[\s\S]*?\);/i,
    )?.[0];
    expect(gatheringDetail).toBeDefined();
    expect(gatheringDetail).not.toMatch(/payment_info/i);
    expect(base).toMatch(/oa_can_read_payment_info[\s\S]*status = 'CONFIRMED'/i);
  });

  it("enables RLS on every user-facing core table", () => {
    const rlsBlock = base.match(
      /foreach table_name in array array\[([\s\S]*?)\][\s\S]*?enable row level security/i,
    )?.[1];
    expect(rlsBlock).toBeDefined();
    for (const table of [
      "users",
      "memberships",
      "programs",
      "gathering_details",
      "gathering_payment_instructions",
      "participations",
      "program_messages",
      "message_reads",
    ]) {
      expect(rlsBlock).toContain(`'${table}'`);
    }
    expect(base).toMatch(
      /execute format\('alter table public\.%I enable row level security'/i,
    );
  });

  it("protects TALK through database capabilities rather than UI state", () => {
    expect(base).toMatch(/create or replace function private\.oa_can_read_program_talk/i);
    expect(base).toMatch(/create or replace function private\.oa_can_write_program_talk/i);
    expect(base).toMatch(/create or replace function private\.oa_can_write_program_notice/i);
    expect(base).toMatch(/x\.status in \('CONFIRMED', 'CANCELLED'\)/i);
    expect(base).toMatch(/x\.status = 'CONFIRMED'/i);
    expect(base).toMatch(/type <> 'NOTICE' or private\.oa_can_write_program_notice/i);
  });
});

describe("Supabase v3.3 TALK realtime hardening", () => {
  it("prevents malformed messages and cross-program reply parents", () => {
    expect(talk).toMatch(/btrim\(content\)/i);
    expect(talk).toMatch(/program_messages_content_not_blank/i);
    expect(talk).toMatch(/program_messages_pinned_notice_only/i);
    expect(talk).toMatch(/MESSAGE_PARENT_PROGRAM_MISMATCH/i);
  });

  it("publishes only the Program message table for the MVP subscription", () => {
    expect(talk).toMatch(
      /alter publication supabase_realtime\s+add table public\.program_messages/i,
    );
    expect(talk).not.toMatch(/add table public\.users/i);
    expect(talk).not.toMatch(/add table public\.participations/i);
  });

  it("keeps MessageRead rows private to their owner", () => {
    expect(talk).toMatch(/message reads belong to reader/i);
    expect(talk).toMatch(/user_id = \(select auth\.uid\(\)\)/i);
  });
});
