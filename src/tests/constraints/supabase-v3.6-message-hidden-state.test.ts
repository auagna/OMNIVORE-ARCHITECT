import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260831010000_add_program_message_hidden_state.sql",
);
const sql = readFileSync(migrationPath, "utf8");
const route = readFileSync(
  resolve(
    process.cwd(),
    "src/app/api/programs/[programId]/messages/[messageId]/reactions/route.ts",
  ),
  "utf8",
);

function functionDefinition(name: string): string {
  const start = sql.search(
    new RegExp(`create or replace function public\\.${name}\\(`, "i"),
  );
  expect(start, `${name} definition`).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("\n$$;", start);
  expect(end, `${name} terminator`).toBeGreaterThan(start);
  return sql.slice(start, end + 4);
}

describe("Supabase v3.6 hidden ProgramMessage state", () => {
  it("adds a non-destructive hidden state in an additive migration", () => {
    expect(sql).toMatch(
      /alter table public\.program_messages[\s\S]*add column if not exists is_hidden boolean not null default false/i,
    );
    expect(sql).not.toMatch(/drop table public\.program_messages/i);
  });

  it("keeps member TALK and reaction reads scoped to visible messages", () => {
    expect(sql).toMatch(
      /create policy "program talk follows capability"[\s\S]*not is_hidden or public\.is_oa_admin\(\)/i,
    );
    expect(sql).toMatch(
      /create policy "program talk readers view message reactions"[\s\S]*not message\.is_hidden or public\.is_oa_admin\(\)/i,
    );
    expect(functionDefinition("list_program_message_reactions")).toMatch(
      /join public\.program_messages as message[\s\S]*not message\.is_hidden/i,
    );
  });

  it("does not leak hidden-message mention metadata outside Admin moderation", () => {
    expect(sql).toMatch(
      /drop policy if exists "mentions visible to mentioned user"\s+on public\.program_message_mentions;/i,
    );
    expect(sql).toMatch(
      /create policy "mentions visible to mentioned user"\s+on public\.program_message_mentions\s+for select\s+to authenticated\s+using \(\s*\(user_id = \(select auth\.uid\(\)\) or private\.oa_is_admin\(\)\)\s+and exists \(\s*select 1\s+from public\.program_messages as message\s+where message\.id = program_message_mentions\.message_id\s+and \(not message\.is_hidden or private\.oa_is_admin\(\)\)\s*\)\s*\);/i,
    );
  });

  it("blocks hidden targets in both the route and atomic toggle RPC", () => {
    const toggle = functionDefinition("toggle_message_reaction");
    expect(toggle).toMatch(/select message\.program_id, message\.is_hidden/i);
    expect(toggle).toMatch(
      /if v_is_hidden then[\s\S]*message = 'MESSAGE_NOT_REACTABLE'/i,
    );
    expect(route).toContain('.select("id, program_id, is_hidden")');
    expect(route).toMatch(/!message\.data \|\| message\.data\.is_hidden/);
  });

  it("retains hard-delete cascade and documents rollback", () => {
    expect(sql).toContain("Hard deletion stays");
    expect(sql).toContain("Manual rollback notes");
    expect(sql).toContain("DROP COLUMN is_hidden");
  });
});
