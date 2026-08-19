import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

import type { OARepository } from "./repositories/contracts";

/** Constructor seam until the generated Database type and adapter land. */
export type SupabaseRepositoryFactory = (
  client: SupabaseClient<Database>,
) => OARepository;
