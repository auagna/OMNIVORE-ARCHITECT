import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase-v3.3-read-models.sql"),
  "utf8",
);

describe("v3.3 safe read models", () => {
  it("uses hardened SECURITY DEFINER functions", () => {
    expect(sql.match(/security definer/gi)).toHaveLength(6);
    expect(sql.match(/set search_path = ''/gi)).toHaveLength(6);
  });

  it("never returns account details or payment instructions", () => {
    expect(sql).not.toMatch(/\bemail\b/i);
    expect(sql).not.toMatch(/payment_info|payment_instructions|\bbank\b|account_number/i);
  });

  it("limits public reads to published Programs and active identities", () => {
    expect(sql).toMatch(/program_has_published_version\(p\.id\)/i);
    expect(sql).toMatch(/u\.status in \('MEMBER', 'ADMIN'\)/i);
    expect(sql).toMatch(/list_program_confirmed_people[\s\S]*private\.oa_is_active_user\(\)/i);
  });

  it("does not expose participant identities to anonymous callers", () => {
    expect(sql).toMatch(
      /grant execute on function public\.list_program_confirmed_people\(uuid\) to authenticated/i,
    );
    expect(sql).not.toMatch(
      /grant execute on function public\.list_program_confirmed_people\(uuid\) to anon/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.get_program_participant_counts\(uuid\) to anon, authenticated/i,
    );
  });

  it("exposes operational participant rows only to the Program Host or Admin", () => {
    const signature = sql.match(
      /list_program_host_participants\(p_program_id uuid\)[\s\S]*?returns table \(([\s\S]*?)\)\s*language plpgsql/i,
    )?.[1];
    expect(signature).toBeDefined();
    expect(signature).toMatch(/participation_id uuid/i);
    expect(signature).toMatch(/participation_status public\.participation_status/i);
    expect(signature).toMatch(/payment_status public\.payment_status/i);
    expect(signature).toMatch(/joined_at timestamptz/i);
    expect(signature).not.toMatch(/\bemail\b|\bcreated_at\b|^\s*status\s+/im);

    expect(sql).toMatch(
      /list_program_host_participants[\s\S]*auth\.uid\(\) is null or not private\.oa_manages_program\(p_program_id\)/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.list_program_host_participants\(uuid\) to authenticated/i,
    );
    expect(sql).not.toMatch(
      /grant execute on function public\.list_program_host_participants\(uuid\) to anon/i,
    );
  });
});
