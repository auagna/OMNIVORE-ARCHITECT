export const DATA_SOURCE_MODES = ["mock", "supabase"] as const;

export type DataSourceMode = (typeof DATA_SOURCE_MODES)[number];

export interface RuntimeEnvironment {
  NEXT_PUBLIC_DATA_SOURCE?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
}

export interface SupabasePublicConfig {
  url: string;
  key: string;
  keySource:
    | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    | "NEXT_PUBLIC_SUPABASE_ANON_KEY";
}

export type RuntimeConfigurationErrorCode =
  | "UNSUPPORTED_DATA_SOURCE"
  | "MISSING_SUPABASE_CONFIG"
  | "SUPABASE_ADAPTER_NOT_INSTALLED"
  | "MOCK_CONTROL_UNAVAILABLE";

export class RuntimeConfigurationError extends Error {
  constructor(
    public readonly code: RuntimeConfigurationErrorCode,
    message: string,
    public readonly missingKeys: readonly string[] = [],
  ) {
    super(message);
    this.name = "RuntimeConfigurationError";
  }
}

export function readRuntimeEnvironment(): RuntimeEnvironment {
  return {
    NEXT_PUBLIC_DATA_SOURCE: process.env.NEXT_PUBLIC_DATA_SOURCE,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

export function resolveDataSourceMode(value?: string): DataSourceMode {
  const candidate = value?.trim() || "mock";
  if ((DATA_SOURCE_MODES as readonly string[]).includes(candidate)) {
    return candidate as DataSourceMode;
  }
  throw new RuntimeConfigurationError(
    "UNSUPPORTED_DATA_SOURCE",
    `Unsupported NEXT_PUBLIC_DATA_SOURCE: ${candidate}. Expected mock or supabase.`,
  );
}

export function resolveSupabasePublicConfig(
  environment: RuntimeEnvironment,
): SupabasePublicConfig {
  const url = environment.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const publishableKey =
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  const legacyAnonKey = environment.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  const missingKeys: string[] = [];

  if (!url) missingKeys.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!publishableKey && !legacyAnonKey) {
    missingKeys.push(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or legacy NEXT_PUBLIC_SUPABASE_ANON_KEY)",
    );
  }

  if (missingKeys.length > 0) {
    throw new RuntimeConfigurationError(
      "MISSING_SUPABASE_CONFIG",
      `Supabase runtime configuration is incomplete: ${missingKeys.join(", ")}`,
      missingKeys,
    );
  }

  if (publishableKey) {
    return {
      url,
      key: publishableKey,
      keySource: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    };
  }

  return {
    url,
    key: legacyAnonKey,
    keySource: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  };
}
