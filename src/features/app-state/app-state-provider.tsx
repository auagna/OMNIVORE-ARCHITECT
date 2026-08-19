"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  isPasswordAuthSessionRepository,
  type AuthSeasonOption,
  type MockAuthIdentity,
  type PasswordSignInInput,
  type PasswordSignUpInput,
  type PasswordSignUpResult,
} from "@/lib/auth";
import type { OARepository } from "@/lib/repositories";
import {
  getClientRuntime,
  RuntimeConfigurationError,
  type DataSourceMode,
} from "@/lib/runtime";

interface AppStateContextValue {
  mode: DataSourceMode;
  repository: OARepository;
  revision: number;
  currentUserId: string | null;
  sessionLoading: boolean;
  resetMock: () => Promise<void>;
  signInMock: (identity?: MockAuthIdentity) => Promise<void>;
  listAuthSeasons: () => Promise<AuthSeasonOption[]>;
  signInWithPassword: (input: PasswordSignInInput) => Promise<void>;
  signUp: (input: PasswordSignUpInput) => Promise<PasswordSignUpResult>;
  signOut: () => Promise<void>;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);
const clientRuntime = getClientRuntime();
const clientRepository = clientRuntime.repository;
const authRepository = clientRuntime.auth;

export function AppStateProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(
    clientRepository.subscribe.bind(clientRepository),
    clientRepository.getSnapshot.bind(clientRepository),
    clientRepository.getServerSnapshot.bind(clientRepository),
  );
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const unsubscribe = authRepository.subscribe((userId) => {
      if (!alive) return;
      setCurrentUserId(userId);
      setSessionLoading(false);
    });
    void authRepository.getCurrentUserId().then((userId) => {
      if (!alive) return;
      setCurrentUserId(userId);
      setSessionLoading(false);
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  const resetMock = useCallback(async () => {
    if (!clientRuntime.mockControl) {
      throw new RuntimeConfigurationError(
        "MOCK_CONTROL_UNAVAILABLE",
        "Mock reset is unavailable outside the mock runtime.",
      );
    }
    await clientRuntime.mockControl.reset();
    setCurrentUserId(await authRepository.getCurrentUserId());
  }, []);

  const signInMock = useCallback(async (identity: MockAuthIdentity = "MEMBER") => {
    if (!clientRuntime.mockControl) {
      throw new RuntimeConfigurationError(
        "MOCK_CONTROL_UNAVAILABLE",
        "Mock identity switching is unavailable outside the mock runtime.",
      );
    }
    setSessionLoading(true);
    await clientRuntime.mockControl.signIn(identity);
    setCurrentUserId(await authRepository.getCurrentUserId());
    setSessionLoading(false);
  }, []);

  const listAuthSeasons = useCallback(async () => {
    if (!isPasswordAuthSessionRepository(authRepository)) {
      throw new Error("Season discovery is unavailable in the mock runtime.");
    }
    return authRepository.listSeasons();
  }, []);

  const signInWithPassword = useCallback(async (input: PasswordSignInInput) => {
    if (!isPasswordAuthSessionRepository(authRepository)) {
      throw new Error("Password authentication is unavailable in the mock runtime.");
    }
    await authRepository.signInWithPassword(input);
    setCurrentUserId(await authRepository.getCurrentUserId());
    setSessionLoading(false);
  }, []);

  const signUp = useCallback(async (input: PasswordSignUpInput) => {
    if (!isPasswordAuthSessionRepository(authRepository)) {
      throw new Error("Registration is unavailable in the mock runtime.");
    }
    const result = await authRepository.signUp(input);
    if (result.status === "SIGNED_IN") {
      setCurrentUserId(await authRepository.getCurrentUserId());
      setSessionLoading(false);
    }
    return result;
  }, []);

  const signOut = useCallback(async () => {
    await authRepository.signOut();
    setCurrentUserId(null);
    setSessionLoading(false);
  }, []);

  const value = useMemo(
    () => ({
      mode: clientRuntime.mode,
      repository: clientRepository,
      revision: snapshot.revision,
      currentUserId,
      sessionLoading,
      resetMock,
      signInMock,
      listAuthSeasons,
      signInWithPassword,
      signUp,
      signOut,
    }),
    [
      currentUserId,
      listAuthSeasons,
      resetMock,
      sessionLoading,
      signInMock,
      signInWithPassword,
      signOut,
      signUp,
      snapshot.revision,
    ],
  );
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error("useAppState must be used within AppStateProvider");
  }
  return context;
}

interface RepositoryQuery<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  reload: () => void;
}

export function useRepositoryQuery<T>(
  query: (repository: OARepository) => Promise<T>,
  dependencies: ReadonlyArray<unknown> = [],
): RepositoryQuery<T> {
  const { repository, revision } = useAppState();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    let alive = true;
    void query(repository)
      .then((result) => {
        if (!alive) return;
        setData(result);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!alive) return;
        setError(reason instanceof Error ? reason : new Error("데이터를 불러오지 못했습니다."));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
    // revision intentionally invalidates repository queries after a mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository, revision, nonce, ...dependencies]);

  return { data, error, loading, reload };
}
