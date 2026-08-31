import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminMembers } from "@/app/admin/admin-members";
import { createMockRepositoryState } from "@/lib/repositories/mock-data";

const useAppState = vi.fn();
const useRepositoryQuery = vi.fn();

vi.mock("@/features/app-state/app-state-provider", () => ({
  useAppState: () => useAppState(),
  useRepositoryQuery: (...arguments_: unknown[]) => useRepositoryQuery(...arguments_),
}));

describe("AdminMembers", () => {
  beforeEach(() => {
    const state = createMockRepositoryState();
    const pendingUser = state.users.find((user) => user.status === "PENDING");
    if (!pendingUser) throw new Error("Missing pending Member fixture");
    useAppState.mockReset();
    useRepositoryQuery.mockReset();
    useAppState.mockReturnValue({
      repository: { approvePendingMember: vi.fn() },
      currentUserId: "user-admin",
    });
    useRepositoryQuery.mockReturnValue({
      data: [{ user: pendingUser, participatingSeasons: ["3기"] }],
      loading: false,
      error: null,
      reload: vi.fn(),
    });
  });

  it("includes the Member name in the approval button's accessible name", () => {
    render(<AdminMembers />);

    const pendingName = "서지안";
    expect(screen.getByText(pendingName)).toBeVisible();
    expect(
      screen.getByRole("button", { name: `${pendingName} APPROVE →` }),
    ).toHaveTextContent("APPROVE →");
  });
});
