export interface AuthSessionRepository {
  /**
   * Returns only an identity verified by the adapter. Cookie-backed server
   * implementations must use getClaims() or getUser(), never getSession().user.
   */
  getCurrentUserId(): Promise<string | null>;
  subscribe(listener: (userId: string | null) => void): () => void;
  signOut(): Promise<void>;
}

export interface AuthSeasonOption {
  id: string;
  name: string;
  isCurrent: boolean;
}

export interface PasswordSignInInput {
  email: string;
  password: string;
}

export interface PasswordSignUpInput extends PasswordSignInInput {
  name: string;
  seasonIds: string[];
}

export type PasswordSignUpResult =
  | { status: "SIGNED_IN"; userId: string }
  | { status: "EMAIL_CONFIRMATION_REQUIRED"; userId: string };

/**
 * Production-only email authentication capability. Keeping this separate from
 * AuthSessionRepository prevents the mock adapter from pretending to support
 * password authentication or public season discovery.
 */
export interface PasswordAuthSessionRepository extends AuthSessionRepository {
  listSeasons(): Promise<AuthSeasonOption[]>;
  signInWithPassword(input: PasswordSignInInput): Promise<void>;
  signUp(input: PasswordSignUpInput): Promise<PasswordSignUpResult>;
}

export interface MockAuthSessionRepository extends AuthSessionRepository {
  setCurrentUserId(userId: string): Promise<void>;
  setMockIdentity(identity: MockAuthIdentity): Promise<void>;
  reset(): Promise<void>;
}

/**
 * Development-only identities used by the mock auth adapter. The production
 * Supabase adapter continues to satisfy AuthSessionRepository without knowing
 * about these demo roles.
 */
export type MockAuthIdentity = "MEMBER" | "ADMIN";

export function isMockAuthSessionRepository(
  repository: AuthSessionRepository,
): repository is MockAuthSessionRepository {
  return (
    "setMockIdentity" in repository &&
    typeof repository.setMockIdentity === "function" &&
    "reset" in repository &&
    typeof repository.reset === "function"
  );
}

export function isPasswordAuthSessionRepository(
  repository: AuthSessionRepository,
): repository is PasswordAuthSessionRepository {
  return (
    "listSeasons" in repository &&
    typeof repository.listSeasons === "function" &&
    "signInWithPassword" in repository &&
    typeof repository.signInWithPassword === "function" &&
    "signUp" in repository &&
    typeof repository.signUp === "function"
  );
}

export class AuthError extends Error {
  constructor(
    public readonly code: "UNAUTHENTICATED" | "USER_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}
