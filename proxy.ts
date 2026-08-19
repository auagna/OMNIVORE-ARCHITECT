import { NextResponse, type NextRequest } from "next/server";

import {
  readRuntimeEnvironment,
  resolveDataSourceMode,
} from "@/lib/runtime-config";
import { updateSupabaseSession } from "@/lib/supabase-session-proxy";

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const environment = readRuntimeEnvironment();
  const mode = resolveDataSourceMode(environment.NEXT_PUBLIC_DATA_SOURCE);

  if (mode === "mock") return NextResponse.next({ request });
  return updateSupabaseSession(request, environment);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
