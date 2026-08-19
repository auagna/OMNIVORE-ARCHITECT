import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase-v3.3-talk-realtime.sql"),
  "utf8",
);

describe("Supabase v3.3 TALK Realtime hardening", () => {
  it("fails closed when its base tables or capability helpers are absent", () => {
    expect(sql).toContain("TALK_REALTIME_REQUIRES_PROGRAM_MESSAGES");
    expect(sql).toContain("TALK_REALTIME_REQUIRES_MESSAGE_READS");
    expect(sql).toContain("TALK_REALTIME_REQUIRES_FINAL_CAPABILITY_HELPERS");
    expect(sql).toContain("public.can_read_program_talk(uuid)");
    expect(sql).not.toMatch(/create table\s+(?:if not exists\s+)?public\.program_messages/i);
  });

  it("keeps content, pinning, and QUESTION thread invariants in the database", () => {
    expect(sql).toContain("program_messages_content_not_blank");
    expect(sql).toContain("length(btrim(content)) > 0");
    expect(sql).toContain("program_messages_pinned_notice_only");
    expect(sql).toContain("not is_pinned or type = 'NOTICE'");
    expect(sql).toContain("program_messages_parent_same_program_fkey");
    expect(sql).toContain("foreign key (parent_id, program_id)");
    expect(sql).toContain("PROGRAM_MESSAGE_PARENT_MUST_BE_ROOT_QUESTION");
    expect(sql).toContain("PROGRAM_MESSAGE_NOTICE_CANNOT_BE_REPLY");
    expect(sql).toContain("PROGRAM_MESSAGE_QUESTION_WITH_REPLIES_CANNOT_CHANGE_TYPE");
  });

  it("replaces permissive TALK and own-receipt policies with capability checks", () => {
    expect(sql).toContain('drop policy if exists "program talk follows capability"');
    expect(sql).toContain("public.can_read_program_talk(program_id)");
    expect(sql).toContain("public.can_write_program_talk(program_id)");
    expect(sql).toContain("public.can_write_program_notice(program_id)");
    expect(sql).toContain('create policy "message reads belong to reader"');
    expect(sql).toContain("user_id = (select auth.uid())");
    expect(sql).toContain("from public.program_messages as message");
    expect(sql).toContain("revoke all on table public.program_messages from anon");
    expect(sql).toContain("revoke insert, update, delete, truncate, references, trigger");
    expect(sql).toContain("grant insert (program_id, author_id, type, content, parent_id, is_pinned)");
    expect(sql).toContain("grant update (read_at) on table public.message_reads");
  });

  it("publishes only ProgramMessage changes through an idempotent registration", () => {
    expect(sql).toContain("pg_publication_tables");
    expect(sql).toContain("pubname = 'supabase_realtime'");
    expect(sql).toContain("tablename = 'program_messages'");
    expect(sql).toContain("add table public.program_messages");
    expect(sql).not.toMatch(/add table public\.(?:message_reads|program_message_mentions)/i);
  });

  it("adds only query-specific indexes beyond the base schema", () => {
    expect(sql).toContain("program_messages_program_created_idx");
    expect(sql).toContain("program_messages_pinned_notice_idx");
    expect(sql).toContain("program_messages_parent_created_idx");
    expect(sql).toContain("message_reads_user_message_idx");
    expect(sql).not.toContain("participations_program_user_status_idx");
  });
});
