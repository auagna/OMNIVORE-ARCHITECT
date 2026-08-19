import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  resolveSupabasePublicConfig,
  RuntimeConfigurationError,
} from "@/lib/runtime-config";
import { SupabaseAuthSessionRepository } from "@/lib/supabase-auth";

describe("Supabase SSR foundation", () => {
  it("prefers the publishable key and retains the legacy anon fallback", () => {
    const preferred = resolveSupabasePublicConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://oa.example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_primary",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "legacy-anon",
    });
    const legacy = resolveSupabasePublicConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://oa.example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "legacy-anon",
    });

    expect(preferred).toMatchObject({
      key: "sb_publishable_primary",
      keySource: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    });
    expect(legacy).toMatchObject({
      key: "legacy-anon",
      keySource: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    });
  });

  it("fails closed when either the URL or both public key options are absent", () => {
    expect(() => resolveSupabasePublicConfig({})).toThrow(
      expect.objectContaining<Partial<RuntimeConfigurationError>>({
        code: "MISSING_SUPABASE_CONFIG",
      }),
    );
  });

  it("derives the current id from verified claims and uses getUser for fresh data", async () => {
    const getClaims = vi.fn().mockResolvedValue({
      data: { claims: { sub: "verified-user" } },
      error: null,
    });
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: "verified-user" } },
      error: null,
    });
    const client = {
      auth: { getClaims, getUser },
    } as unknown as SupabaseClient;
    const auth = new SupabaseAuthSessionRepository(client);

    await expect(auth.getCurrentUserId()).resolves.toBe("verified-user");
    await expect(auth.getCurrentAuthUser()).resolves.toMatchObject({
      id: "verified-user",
    });
    expect(getClaims).toHaveBeenCalledOnce();
    expect(getUser).toHaveBeenCalledOnce();
  });

  it("keeps Proxy verification and cookie propagation in the release contract", () => {
    const helper = readFileSync(
      resolve(process.cwd(), "src/lib/supabase-session-proxy.ts"),
      "utf8",
    );
    const rootProxy = readFileSync(resolve(process.cwd(), "proxy.ts"), "utf8");

    expect(helper).toContain("client.auth.getClaims()");
    expect(helper).not.toContain("client.auth.getSession()");
    expect(helper).toContain("request.cookies.set");
    expect(helper).toContain("response.cookies.set");
    expect(rootProxy).toContain('mode === "mock"');
    expect(rootProxy).toContain("updateSupabaseSession");
  });
});
