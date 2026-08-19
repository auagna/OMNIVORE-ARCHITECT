import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import {
  readRuntimeEnvironment,
  resolveSupabasePublicConfig,
  type RuntimeEnvironment,
} from "./runtime-config";

/** Creates a request-scoped client for Server Components, Actions, and routes. */
export async function createSupabaseServerClient(
  environment: RuntimeEnvironment = readRuntimeEnvironment(),
): Promise<SupabaseClient> {
  const config = resolveSupabasePublicConfig(environment);
  const cookieStore = await cookies();

  return createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot write response cookies. The root Proxy
          // refreshes the session and persists rotated tokens for them.
        }
      },
    },
  });
}
