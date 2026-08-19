import type { SupabaseClient, User as SupabaseUser } from "@supabase/supabase-js";

import type {
  AuthSeasonOption,
  PasswordAuthSessionRepository,
  PasswordSignInInput,
  PasswordSignUpInput,
  PasswordSignUpResult,
} from "./auth/types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required.`);
  return normalized;
}

function normalizeSeasonIds(seasonIds: string[]): string[] {
  const normalized = [...new Set(seasonIds.map((id) => id.trim()).filter(Boolean))];
  if (normalized.length === 0) throw new Error("At least one season is required.");
  if (normalized.length > 32) throw new Error("At most 32 seasons can be selected.");
  if (normalized.some((id) => !UUID_PATTERN.test(id))) {
    throw new Error("Every season id must be a valid UUID.");
  }
  return normalized;
}

function isMissingSession(error: { name?: string } | null): boolean {
  return error?.name === "AuthSessionMissingError";
}

/**
 * Browser session adapter. Identity comes from verified JWT claims, never from
 * the unverified user object returned by getSession().
 */
export class SupabaseAuthSessionRepository implements PasswordAuthSessionRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getCurrentUserId(): Promise<string | null> {
    const { data, error } = await this.client.auth.getClaims();
    if (isMissingSession(error)) return null;
    if (error) throw error;
    return typeof data?.claims.sub === "string" ? data.claims.sub : null;
  }

  /** Fetches the current, server-confirmed Auth user when fresh metadata matters. */
  async getCurrentAuthUser(): Promise<SupabaseUser | null> {
    const { data, error } = await this.client.auth.getUser();
    if (isMissingSession(error)) return null;
    if (error) throw error;
    return data.user;
  }

  async listSeasons(): Promise<AuthSeasonOption[]> {
    const { data, error } = await this.client
      .from("seasons")
      .select("id, name, is_current")
      .order("is_current", { ascending: false })
      .order("start_at", { ascending: false, nullsFirst: false })
      .order("name", { ascending: true });
    if (error) throw error;

    const rows = (data ?? []) as Array<{
      id: unknown;
      name: unknown;
      is_current: unknown;
    }>;
    return rows.map((row) => {
      if (
        typeof row.id !== "string" ||
        typeof row.name !== "string" ||
        typeof row.is_current !== "boolean"
      ) {
        throw new Error("Supabase returned an invalid season row.");
      }
      return { id: row.id, name: row.name, isCurrent: row.is_current };
    });
  }

  async signInWithPassword(input: PasswordSignInInput): Promise<void> {
    const email = requireText(input.email, "Email");
    if (!input.password) throw new Error("Password is required.");
    const { error } = await this.client.auth.signInWithPassword({
      email,
      password: input.password,
    });
    if (error) throw error;
  }

  async signUp(input: PasswordSignUpInput): Promise<PasswordSignUpResult> {
    const name = requireText(input.name, "Name");
    if (name.length > 100) throw new Error("Name must be 100 characters or fewer.");
    const email = requireText(input.email, "Email");
    if (!input.password) throw new Error("Password is required.");
    const seasonIds = normalizeSeasonIds(input.seasonIds);
    const { data, error } = await this.client.auth.signUp({
      email,
      password: input.password,
      options: {
        data: {
          name,
          season_ids: seasonIds,
        },
      },
    });
    if (error) throw error;
    if (!data.user) throw new Error("Supabase did not return the registered user.");

    return data.session
      ? { status: "SIGNED_IN", userId: data.user.id }
      : { status: "EMAIL_CONFIRMATION_REQUIRED", userId: data.user.id };
  }

  subscribe(listener: (userId: string | null) => void): () => void {
    const { data } = this.client.auth.onAuthStateChange(() => {
      // Avoid awaiting another Auth call inside the SDK callback lock.
      queueMicrotask(() => {
        void this.getCurrentUserId()
          .then(listener)
          .catch(() => listener(null));
      });
    });
    return () => data.subscription.unsubscribe();
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
  }
}
