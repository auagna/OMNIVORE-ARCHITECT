import {
  isMockAuthSessionRepository,
  type AuthSessionRepository,
  type MockAuthIdentity,
} from "./auth/types";
import { mockAuthRepository } from "./auth/mock-auth";
import {
  isResettableRepository,
  type OARepository,
} from "./repositories/contracts";
import { mockRepository } from "./repositories/mock-repository";
import { createSupabaseBrowserClient } from "./supabase-browser";
import { SupabaseAuthSessionRepository } from "./supabase-auth";
import type { SupabaseRepositoryFactory } from "./supabase-repository-contract";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createSupabaseRepository as createDefaultSupabaseRepository } from "./supabase-repository";
import {
  readRuntimeEnvironment,
  resolveDataSourceMode,
  resolveSupabasePublicConfig,
  type DataSourceMode,
  type RuntimeEnvironment,
} from "./runtime-config";

export * from "./runtime-config";

export interface MockRuntimeControl {
  reset(): Promise<void>;
  signIn(identity?: MockAuthIdentity): Promise<void>;
}

export interface AppRuntime {
  mode: DataSourceMode;
  repository: OARepository;
  auth: AuthSessionRepository;
  mockControl?: MockRuntimeControl;
}

export interface RuntimeFactories {
  createSupabaseClient?: (
    environment: RuntimeEnvironment,
  ) => SupabaseClient<Database>;
  createSupabaseAuth?: (
    client: SupabaseClient<Database>,
  ) => AuthSessionRepository;
  createSupabaseRepository?: SupabaseRepositoryFactory;
}

function createMockRuntime(): AppRuntime {
  if (!isMockAuthSessionRepository(mockAuthRepository)) {
    throw new Error("The mock runtime requires a mock-capable auth adapter.");
  }

  return {
    mode: "mock",
    repository: mockRepository,
    auth: mockAuthRepository,
    mockControl: {
      async reset() {
        if (isResettableRepository(mockRepository)) mockRepository.reset();
        await mockAuthRepository.reset();
      },
      async signIn(identity = "MEMBER") {
        await mockAuthRepository.setMockIdentity(identity);
      },
    },
  };
}

function createSupabaseRuntime(
  environment: RuntimeEnvironment,
  factories: RuntimeFactories,
): AppRuntime {
  resolveSupabasePublicConfig(environment);

  const client = (factories.createSupabaseClient ?? createSupabaseBrowserClient)(
    environment,
  );
  const auth = factories.createSupabaseAuth
    ? factories.createSupabaseAuth(client)
    : new SupabaseAuthSessionRepository(client);

  return {
    mode: "supabase",
    repository: (factories.createSupabaseRepository ?? createDefaultSupabaseRepository)(client),
    auth,
  };
}

export function createClientRuntime(
  environment: RuntimeEnvironment,
  factories: RuntimeFactories = {},
): AppRuntime {
  const mode = resolveDataSourceMode(environment.NEXT_PUBLIC_DATA_SOURCE);
  return mode === "mock"
    ? createMockRuntime()
    : createSupabaseRuntime(environment, factories);
}

let clientRuntime: AppRuntime | null = null;

export function getClientRuntime(): AppRuntime {
  clientRuntime ??= createClientRuntime(readRuntimeEnvironment());
  return clientRuntime;
}
