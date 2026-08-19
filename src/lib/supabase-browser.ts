import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

import {
  readRuntimeEnvironment,
  resolveSupabasePublicConfig,
  type RuntimeEnvironment,
} from "./runtime-config";

export function createSupabaseBrowserClient(
  environment: RuntimeEnvironment = readRuntimeEnvironment(),
): SupabaseClient<Database> {
  const config = resolveSupabasePublicConfig(environment);
  return createBrowserClient<Database>(config.url, config.key);
}
