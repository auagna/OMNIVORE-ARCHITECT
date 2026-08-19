import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase-v3.3-auth-registration.sql"),
  "utf8",
).toLowerCase();

describe("Supabase auth registration migration", () => {
  it("creates a pending profile and selected memberships in the auth trigger transaction", () => {
    expect(sql).toContain("create or replace function private.oa_handle_new_auth_user()");
    expect(sql).toContain("after insert on auth.users");
    expect(sql).toContain("insert into public.users");
    expect(sql).toContain("'pending'");
    expect(sql).toContain("insert into public.memberships");
    expect(sql).toContain("begin;");
    expect(sql).toContain("commit;");
  });

  it("requires a non-empty array of existing season UUIDs", () => {
    expect(sql).toContain("raw_user_meta_data -> 'season_ids'");
    expect(sql).toContain("jsonb_array_elements_text");
    expect(sql).toContain("value::uuid");
    expect(sql).toContain("from public.seasons");
    expect(sql).toContain("v_existing_count <> v_requested_count");
    expect(sql).toContain("registration requires at least one season");
    expect(sql).toContain("unknown season id");
    expect(sql).toContain("jsonb_array_length");
    expect(sql).toContain("> 32");
    expect(sql).toContain("char_length(v_name) > 100");
  });

  it("keeps the trigger private and its definer search path closed", () => {
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain(
      "revoke all on function private.oa_handle_new_auth_user() from anon, authenticated",
    );
    expect(sql).not.toContain("service_role");
  });
});
