import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { SupabaseAuthSessionRepository } from "@/lib/supabase-auth";

const SEASON_ID = "11111111-1111-4111-8111-111111111111";

describe("Supabase password authentication", () => {
  it("signs in with a trimmed email without altering the password", async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({ data: {}, error: null });
    const client = { auth: { signInWithPassword } } as unknown as SupabaseClient;
    const auth = new SupabaseAuthSessionRepository(client);

    await auth.signInWithPassword({ email: "  member@oa.test ", password: " p a s s " });

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "member@oa.test",
      password: " p a s s ",
    });
  });

  it("passes normalized signup metadata and reports an email-confirmation result", async () => {
    const signUp = vi.fn().mockResolvedValue({
      data: { user: { id: "new-user" }, session: null },
      error: null,
    });
    const client = { auth: { signUp } } as unknown as SupabaseClient;
    const auth = new SupabaseAuthSessionRepository(client);

    await expect(
      auth.signUp({
        name: "  김유진  ",
        email: " new@oa.test ",
        password: "secret",
        seasonIds: [SEASON_ID, SEASON_ID],
      }),
    ).resolves.toEqual({ status: "EMAIL_CONFIRMATION_REQUIRED", userId: "new-user" });
    expect(signUp).toHaveBeenCalledWith({
      email: "new@oa.test",
      password: "secret",
      options: { data: { name: "김유진", season_ids: [SEASON_ID] } },
    });
  });

  it("rejects an empty or malformed season selection before signup", async () => {
    const signUp = vi.fn();
    const client = { auth: { signUp } } as unknown as SupabaseClient;
    const auth = new SupabaseAuthSessionRepository(client);

    await expect(
      auth.signUp({ name: "OA", email: "oa@example.com", password: "secret", seasonIds: [] }),
    ).rejects.toThrow("At least one season");
    await expect(
      auth.signUp({
        name: "OA",
        email: "oa@example.com",
        password: "secret",
        seasonIds: ["not-a-uuid"],
      }),
    ).rejects.toThrow("valid UUID");
    await expect(
      auth.signUp({
        name: "OA",
        email: "oa@example.com",
        password: "secret",
        seasonIds: Array.from(
          { length: 33 },
          (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        ),
      }),
    ).rejects.toThrow("At most 32 seasons");
    expect(signUp).not.toHaveBeenCalled();
  });

  it("maps only the public season fields", async () => {
    const order = vi.fn();
    const query = {
      select: vi.fn(),
      order,
    };
    query.select.mockReturnValue(query);
    order
      .mockReturnValueOnce(query)
      .mockReturnValueOnce(query)
      .mockResolvedValueOnce({
        data: [{ id: SEASON_ID, name: "3기", is_current: true }],
        error: null,
      });
    const from = vi.fn().mockReturnValue(query);
    const client = { auth: {}, from } as unknown as SupabaseClient;
    const auth = new SupabaseAuthSessionRepository(client);

    await expect(auth.listSeasons()).resolves.toEqual([
      { id: SEASON_ID, name: "3기", isCurrent: true },
    ]);
    expect(from).toHaveBeenCalledWith("seasons");
    expect(query.select).toHaveBeenCalledWith("id, name, is_current");
  });
});
