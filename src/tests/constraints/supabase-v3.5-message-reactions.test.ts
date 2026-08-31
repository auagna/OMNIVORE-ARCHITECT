import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260831000000_create_message_reactions.sql",
);
const sql = readFileSync(migrationPath, "utf8");

function functionDefinition(name: string): string {
  const start = sql.search(
    new RegExp(`create or replace function (?:public|private)\\.${name}\\(`, "i"),
  );
  expect(start, `${name} definition`).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("\n$$;", start);
  expect(end, `${name} terminator`).toBeGreaterThan(start);
  return sql.slice(start, end + 4);
}

describe("Supabase v3.5 ProgramMessage reactions", () => {
  it("keeps the timestamped migration as the only v3.5 SQL source of truth", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(
      existsSync(resolve(process.cwd(), "supabase-v3.5-message-reactions.sql")),
    ).toBe(false);
  });

  it("models one exact allowlisted reaction per message and user", () => {
    expect(sql).toMatch(/create table public\.message_reactions/i);
    expect(sql).toMatch(/id uuid primary key default gen_random_uuid\(\)/i);
    expect(sql).toMatch(
      /unique \(message_id, user_id\)/i,
    );
    expect(sql).toMatch(
      /foreign key \(message_id, program_id\)[\s\S]*references public\.program_messages\(id, program_id\)[\s\S]*on delete cascade/i,
    );
    expect(sql).toMatch(/created_at timestamptz not null default now\(\)/i);
    expect(sql).toMatch(/updated_at timestamptz not null default now\(\)/i);

    const allowlist = sql.match(
      /message_reactions_emoji_allowlist check \([\s\S]*?emoji in \(([^)]*)\)/i,
    );
    expect(allowlist?.[1]?.match(/'[^']+'/g)).toEqual([
      "'👍'",
      "'❤️'",
      "'😂'",
      "'😮'",
      "'👏'",
      "'✅'",
    ]);
  });

  it("allows only TALK-authorized reads and keeps all writes RPC-only", () => {
    expect(sql).toMatch(/alter table public\.message_reactions enable row level security/i);
    expect(sql).toMatch(
      /revoke all on table public\.message_reactions from public, anon, authenticated/i,
    );
    expect(sql).toMatch(/grant select on table public\.message_reactions to authenticated/i);
    expect(sql).toMatch(/using \(public\.can_read_program_talk\(program_id\)\)/i);
    expect(sql).not.toMatch(
      /grant\s+(?:insert|update|delete)[\s\S]*on table public\.message_reactions/i,
    );
  });

  it("returns enriched reaction rows in an optional authorized batch", () => {
    const list = functionDefinition("list_program_message_reactions");

    expect(list).toMatch(/p_message_ids uuid\[\] default null/i);
    expect(list).toMatch(/security definer/i);
    expect(list).toMatch(/set search_path = ''/i);
    expect(list).toMatch(/auth\.uid\(\) is null/i);
    expect(list).toMatch(/not public\.can_read_program_talk\(p_program_id\)/i);
    expect(list).toMatch(/join public\.users as member/i);
    expect(list).toMatch(/from public\.memberships as membership/i);
    expect(list).toMatch(/join public\.seasons as season/i);
    expect(list).toMatch(/reaction\.message_id = any\(p_message_ids\)/i);
    expect(list).toMatch(/participating_seasons text\[\]/i);
  });

  it("atomically deletes, changes, or inserts the authenticated member reaction", () => {
    const toggle = functionDefinition("toggle_message_reaction");

    expect(toggle).toMatch(/returns setof public\.message_reactions/i);
    expect(toggle).toMatch(/security definer/i);
    expect(toggle).toMatch(/set search_path = ''/i);
    expect(toggle).toMatch(/v_user_id uuid := auth\.uid\(\)/i);
    expect(toggle).not.toMatch(/p_(?:user|actor|author)_id/i);
    expect(toggle).toMatch(/for key share/i);
    expect(toggle).toMatch(/not public\.can_write_program_talk\(v_program_id\)/i);
    expect(toggle).toMatch(/pg_advisory_xact_lock/i);
    expect(toggle).toMatch(/for update/i);
    expect(toggle).toMatch(/v_existing\.emoji = p_emoji[\s\S]*delete from public\.message_reactions/i);
    expect(toggle).toMatch(/update public\.message_reactions[\s\S]*emoji = p_emoji/i);
    expect(toggle).toMatch(/insert into public\.message_reactions/i);
    expect(toggle).toMatch(/return next v_result/i);
  });

  it("broadcasts reaction invalidations only on a private TALK-authorized topic", () => {
    const broadcast = functionDefinition("oa_broadcast_message_reaction_change");

    expect(broadcast).toMatch(/realtime\.broadcast_changes/i);
    expect(broadcast).toContain("oa-program-talk:");
    expect(sql).toMatch(/after insert or update or delete[\s\S]*on public\.message_reactions/i);
    expect(sql).toMatch(
      /create policy "program talk readers receive reaction broadcasts"[\s\S]*on realtime\.messages[\s\S]*for select[\s\S]*to authenticated/i,
    );
    expect(sql).toMatch(/realtime\.messages\.extension = 'broadcast'/i);
    expect(sql).toMatch(/public\.can_read_program_talk\(program\.id\)/i);
    expect(sql).not.toMatch(
      /alter publication supabase_realtime[\s\S]*add table public\.message_reactions/i,
    );
  });

  it("restricts the confirmed People list to Program TALK readers", () => {
    const people = functionDefinition("list_program_confirmed_people");

    expect(people).toMatch(/not public\.can_read_program_talk\(p_program_id\)/i);
    expect(people).toMatch(/message = 'FORBIDDEN'/i);
    expect(people).not.toMatch(/oa_can_read_public_program/i);
  });

  it("documents the destructive rollback without weakening People privacy", () => {
    expect(sql).toContain("Manual rollback notes");
    expect(sql).toContain("DROP TABLE public.message_reactions");
    expect(sql).toContain("Keep the TALK-gated list_program_confirmed_people definition");
  });
});
