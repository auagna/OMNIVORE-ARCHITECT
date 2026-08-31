import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationDirectory = resolve(process.cwd(), "supabase/migrations");

const expectedMigrations = [
  "20260829000000_base.sql",
  "20260829010000_auth_registration.sql",
  "20260829020000_v3.sql",
  "20260829030000_v3_1.sql",
  "20260829040000_v3_2.sql",
  "20260829050000_lifecycle_rpc.sql",
  "20260829060000_revision_apply.sql",
  "20260829070000_read_models.sql",
  "20260829080000_gathering_write_rpc.sql",
  "20260829090000_talk_realtime.sql",
  "20260830000000_admin_operations.sql",
  "20260831000000_create_message_reactions.sql",
  "20260831010000_add_program_message_hidden_state.sql",
  "20260831020000_seed_default_seasons.sql",
  "20260831030000_seed_default_page_content.sql",
  "20260831040000_reaction_security_hardening.sql",
] as const;

const legacyCopies = [
  ["supabase-v3.3-base.sql", expectedMigrations[0]],
  ["supabase-v3.3-auth-registration.sql", expectedMigrations[1]],
  ["supabase-v3.sql", expectedMigrations[2]],
  ["supabase-v3.1.sql", expectedMigrations[3]],
  ["supabase-v3.2.sql", expectedMigrations[4]],
  ["supabase-v3.3-lifecycle-rpc.sql", expectedMigrations[5]],
  ["supabase-v3.3-revision-apply.sql", expectedMigrations[6]],
  ["supabase-v3.3-read-models.sql", expectedMigrations[7]],
  ["supabase-v3.3-gathering-write-rpc.sql", expectedMigrations[8]],
  ["supabase-v3.3-talk-realtime.sql", expectedMigrations[9]],
  ["supabase-v3.4-admin-operations.sql", expectedMigrations[10]],
] as const;

describe("Supabase production release chain", () => {
  it("keeps one complete, ordered fresh-project migration chain", () => {
    const actual = readdirSync(migrationDirectory)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    expect(actual).toEqual(expectedMigrations);
  });

  it("keeps migrated legacy SQL byte-equivalent apart from trailing whitespace", () => {
    for (const [legacy, migration] of legacyCopies) {
      const legacySql = readFileSync(resolve(process.cwd(), legacy), "utf8");
      const migrationSql = readFileSync(
        resolve(migrationDirectory, migration),
        "utf8",
      );

      expect(migrationSql.trimEnd(), migration).toBe(legacySql.trimEnd());
    }
  });

  it("ships the npm lockfile to Git and Vercel", () => {
    const lockfilePath = resolve(process.cwd(), "package-lock.json");
    const gitignore = readFileSync(resolve(process.cwd(), ".gitignore"), "utf8");
    const vercelignore = readFileSync(
      resolve(process.cwd(), ".vercelignore"),
      "utf8",
    );

    expect(existsSync(lockfilePath)).toBe(true);

    const lockfile = JSON.parse(readFileSync(lockfilePath, "utf8")) as {
      lockfileVersion?: number;
      packages?: Record<string, unknown>;
    };

    expect(lockfile.lockfileVersion).toBe(3);
    expect(lockfile.packages?.[""]).toBeDefined();
    expect(gitignore.split(/\r?\n/)).not.toContain("package-lock.json");
    expect(vercelignore.split(/\r?\n/)).not.toContain("package-lock.json");
  });
});
