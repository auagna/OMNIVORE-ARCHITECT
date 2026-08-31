import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260831040000_reaction_security_hardening.sql",
);
const sql = readFileSync(migrationPath, "utf8");

function functionDefinition(name: string): string {
  const start = sql.search(
    new RegExp(`create or replace function public\\.${name}\\(`, "i"),
  );
  expect(start, `${name} definition`).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("\n$$;", start);
  expect(end, `${name} terminator`).toBeGreaterThan(start);
  return sql.slice(start, end + 4);
}

describe("Supabase v3.7 reaction security hardening", () => {
  it("ships as the additive migration after release content seed", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(sql).toContain("begin;");
    expect(sql).toContain("commit;");
    expect(sql).not.toMatch(/drop table public\.(?:program_messages|message_reactions)/i);
  });

  it("provides one Admin-only atomic soft-moderation RPC", () => {
    const hide = functionDefinition("set_program_message_hidden");

    expect(hide).toMatch(/v_actor_id uuid := auth\.uid\(\)/i);
    expect(hide).toMatch(/from public\.users as actor[\s\S]*for share/i);
    expect(hide).toMatch(/not private\.oa_is_admin\(\)/i);
    expect(hide).not.toMatch(/public\.is_oa_admin\(\)/i);
    expect(hide).toMatch(/from public\.program_messages as message[\s\S]*for update/i);
    expect(hide).toMatch(/set is_hidden = p_hidden/i);
    expect(hide).not.toMatch(/delete from public\.program_messages/i);
    expect(hide).toMatch(/return query[\s\S]*v_message_id[\s\S]*v_is_hidden/i);
    expect(sql).toMatch(
      /revoke all on function public\.set_program_message_hidden\(uuid, boolean\)[\s\S]*from public, anon, authenticated/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.set_program_message_hidden\(uuid, boolean\)[\s\S]*to authenticated/i,
    );
  });

  it("locks every mutable capability input before reaction authorization", () => {
    const toggle = functionDefinition("toggle_message_reaction");
    const userLock = toggle.search(/from public\.users as actor[\s\S]*?for share/i);
    const programLock = toggle.search(/from public\.programs as program[\s\S]*?for share/i);
    const participationLock = toggle.search(
      /from public\.participations as participation[\s\S]*?for share/i,
    );
    const capabilityCheck = toggle.search(
      /not public\.can_write_program_talk\(v_program_id\)/i,
    );
    const firstDml = toggle.search(
      /(?:delete from|update|insert into) public\.message_reactions/i,
    );

    expect(toggle).toMatch(
      /from public\.program_messages as message[\s\S]*for share/i,
    );
    expect(userLock).toBeGreaterThanOrEqual(0);
    expect(programLock).toBeGreaterThan(userLock);
    expect(participationLock).toBeGreaterThan(programLock);
    expect(capabilityCheck).toBeGreaterThan(participationLock);
    expect(firstDml).toBeGreaterThan(capabilityCheck);
  });

  it("preserves hidden/read-only checks and one-reaction toggle semantics", () => {
    const toggle = functionDefinition("toggle_message_reaction");

    expect(toggle).toMatch(
      /p_emoji not in \('👍', '❤️', '😂', '😮', '👏', '✅'\)/i,
    );
    expect(toggle).toMatch(
      /if v_is_hidden then[\s\S]*message = 'MESSAGE_NOT_REACTABLE'/i,
    );
    expect(toggle).toMatch(/pg_advisory_xact_lock/i);
    expect(toggle).toMatch(
      /v_existing\.emoji = p_emoji[\s\S]*delete from public\.message_reactions/i,
    );
    expect(toggle).toMatch(/update public\.message_reactions[\s\S]*emoji = p_emoji/i);
    expect(toggle).toMatch(/insert into public\.message_reactions/i);
    expect(sql).toMatch(
      /revoke all on function public\.toggle_message_reaction\(uuid, text\)[\s\S]*from public, anon, authenticated/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.toggle_message_reaction\(uuid, text\)[\s\S]*to authenticated/i,
    );
  });

  it("documents a rollback that does not remove audit or reaction data", () => {
    expect(sql).toContain("Manual rollback notes");
    expect(sql).toContain("DROP FUNCTION public.set_program_message_hidden");
    expect(sql).toContain("Message rows and reaction data are unchanged");
  });
});
