import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminConversations } from "@/app/admin/admin-conversations";
import { buildAdminConversationRooms } from "@/app/admin/admin-data-adapter";
import { buildProgramSnapshot } from "@/features/programs/model";
import {
  createMockRepositoryState,
  MOCK_PROGRAM_IDS,
} from "@/lib/repositories/mock-data";
import type { ProgramSnapshot } from "@/types";

const useAppState = vi.fn();
const useRepositoryQuery = vi.fn();

vi.mock("@/features/app-state/app-state-provider", () => ({
  useAppState: () => useAppState(),
  useRepositoryQuery: (...arguments_: unknown[]) => useRepositoryQuery(...arguments_),
}));

function conversationRooms() {
  const state = createMockRepositoryState();
  const snapshots = state.programs.map((program): ProgramSnapshot =>
    buildProgramSnapshot(
      program,
      state.users,
      state.participations,
      state.records,
      "2026-08-20T00:00:00.000Z",
    ));
  return buildAdminConversationRooms(snapshots, state.messages, state.users);
}

describe("AdminConversations", () => {
  beforeEach(() => {
    useAppState.mockReset();
    useRepositoryQuery.mockReset();
    useAppState.mockReturnValue({ currentUserId: "user-admin" });
  });

  it("shows Program context, conversation state, deep links, and category filters", () => {
    const rooms = conversationRooms();
    useRepositoryQuery.mockReturnValue({
      data: rooms,
      loading: false,
      error: null,
      reload: vi.fn(),
    });
    render(<AdminConversations />);

    const exhibition = rooms.find(
      (room) => room.snapshot.program.id === MOCK_PROGRAM_IDS.exhibition,
    );
    const workshop = rooms.find(
      (room) => room.snapshot.program.id === MOCK_PROGRAM_IDS.workshop,
    );
    if (!exhibition?.latestMessage || !workshop) throw new Error("Missing room fixture");

    const exhibitionRow = screen.getByRole("link", { name: /리움 전시 같이 보기/ });
    expect(exhibitionRow).toHaveAttribute(
      "href",
      `/program/${MOCK_PROGRAM_IDS.exhibition}?tab=talk&message=${exhibition.latestMessage.id}`,
    );
    expect(within(exhibitionRow).getByText(/GATHERING \/ EXHIBITION/)).toBeVisible();
    expect(within(exhibitionRow).getByText(exhibition.latestAuthorName ?? "UNKNOWN MEMBER"))
      .toBeVisible();
    expect(within(exhibitionRow).getByText("UNANSWERED")).toBeVisible();

    const workshopRow = screen.getByRole("link", { name: /작은 목재 오브젝트 만들기/ });
    expect(workshopRow).toHaveAttribute(
      "href",
      `/program/${MOCK_PROGRAM_IDS.workshop}?tab=talk`,
    );
    expect(within(workshopRow).getByText("NO MESSAGES")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "GATHERING" }));
    expect(screen.getByRole("group", { name: "Gathering category" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "WORKSHOP" }));

    expect(screen.getByRole("link", { name: /작은 목재 오브젝트 만들기/ })).toBeVisible();
    expect(screen.queryByRole("link", { name: /리움 전시 같이 보기/ })).not.toBeInTheDocument();
  });

  it("shows the loading state", () => {
    useRepositoryQuery.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      reload: vi.fn(),
    });
    render(<AdminConversations />);

    expect(screen.getByRole("status")).toHaveTextContent("Program TALK를 불러오는 중입니다.");
  });

  it("shows a recoverable error state", async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    useRepositoryQuery.mockReturnValue({
      data: null,
      loading: false,
      error: new Error("대화를 불러오지 못했습니다."),
      reload,
    });
    render(<AdminConversations />);

    expect(screen.getByRole("alert")).toHaveTextContent("대화를 불러오지 못했습니다.");
    await user.click(screen.getByRole("button", { name: "RETRY →" }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it("distinguishes an empty collection from an empty filter result", async () => {
    const user = userEvent.setup();
    useRepositoryQuery.mockReturnValue({
      data: [],
      loading: false,
      error: null,
      reload: vi.fn(),
    });
    const { rerender } = render(<AdminConversations />);
    expect(screen.getByRole("heading", { name: "NO PROGRAM CONVERSATIONS" })).toBeVisible();

    useRepositoryQuery.mockReturnValue({
      data: conversationRooms().filter(
        (room) => room.snapshot.program.type === "TALK",
      ),
      loading: false,
      error: null,
      reload: vi.fn(),
    });
    rerender(<AdminConversations />);
    await user.click(screen.getByRole("button", { name: "READING" }));
    expect(screen.getByRole("heading", { name: "NO MATCHING PROGRAMS" })).toBeVisible();
  });
});
