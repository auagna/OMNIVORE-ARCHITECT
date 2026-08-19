import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  readRuntimeEnvironment,
  resolveSupabasePublicConfig,
  type RuntimeEnvironment,
} from "./runtime-config";

/** Refreshes and reissues the cookie session; it does not grant route access. */
export async function updateSupabaseSession(
  request: NextRequest,
  environment: RuntimeEnvironment = readRuntimeEnvironment(),
): Promise<NextResponse> {
  const config = resolveSupabasePublicConfig(environment);
  let response = NextResponse.next({ request });

  const client = createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([name, value]) => {
          response.headers.set(name, value);
        });
      },
    },
  });

  // Keep this immediately after client creation: getClaims verifies the token
  // and lets the SSR client rotate cookies before rendering begins.
  await client.auth.getClaims();
  return response;
}
