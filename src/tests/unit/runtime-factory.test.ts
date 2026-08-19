import { describe, expect, it } from "vitest";

import {
  createClientRuntime,
  resolveDataSourceMode,
  RuntimeConfigurationError,
} from "@/lib/runtime";
import { SupabaseOARepository } from "@/lib/supabase-repository";

function captureConfigurationError(run: () => unknown): RuntimeConfigurationError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(RuntimeConfigurationError);
    return error as RuntimeConfigurationError;
  }
  throw new Error("Expected a RuntimeConfigurationError.");
}

describe("client runtime factory", () => {
  it("defaults to the typed mock runtime and keeps mock controls available", () => {
    expect(resolveDataSourceMode()).toBe("mock");

    const runtime = createClientRuntime({});

    expect(runtime.mode).toBe("mock");
    expect(runtime.repository).toBeDefined();
    expect(runtime.auth).toBeDefined();
    expect(runtime.mockControl).toEqual(
      expect.objectContaining({
        reset: expect.any(Function),
        signIn: expect.any(Function),
      }),
    );
  });

  it("rejects an unknown data source instead of falling back to mock", () => {
    const error = captureConfigurationError(() =>
      createClientRuntime({ NEXT_PUBLIC_DATA_SOURCE: "local" }),
    );

    expect(error.code).toBe("UNSUPPORTED_DATA_SOURCE");
  });

  it("reports missing public Supabase configuration explicitly", () => {
    const error = captureConfigurationError(() =>
      createClientRuntime({ NEXT_PUBLIC_DATA_SOURCE: "supabase" }),
    );

    expect(error.code).toBe("MISSING_SUPABASE_CONFIG");
    expect(error.missingKeys).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or legacy NEXT_PUBLIC_SUPABASE_ANON_KEY)",
    ]);
  });

  it("installs the production repository by default without mock fallback", () => {
    const mockRuntime = createClientRuntime({});
    const client = {} as never;
    const runtime = createClientRuntime(
      {
        NEXT_PUBLIC_DATA_SOURCE: "supabase",
        NEXT_PUBLIC_SUPABASE_URL: "https://oa.example.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
      },
      {
        createSupabaseClient: () => client,
        createSupabaseAuth: () => mockRuntime.auth,
      },
    );

    expect(runtime.repository).toBeInstanceOf(SupabaseOARepository);
    expect(runtime.mockControl).toBeUndefined();
  });

  it("composes injected Supabase data and auth adapters without mock controls", () => {
    const mockRuntime = createClientRuntime({});
    const client = {} as never;
    const runtime = createClientRuntime(
      {
        NEXT_PUBLIC_DATA_SOURCE: "supabase",
        NEXT_PUBLIC_SUPABASE_URL: "https://oa.example.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      },
      {
        createSupabaseClient: () => client,
        createSupabaseAuth: () => mockRuntime.auth,
        createSupabaseRepository: () => mockRuntime.repository,
      },
    );

    expect(runtime).toMatchObject({
      mode: "supabase",
      repository: mockRuntime.repository,
      auth: mockRuntime.auth,
    });
    expect(runtime.mockControl).toBeUndefined();
  });
});
