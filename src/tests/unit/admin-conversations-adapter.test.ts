import { describe, expect, it, vi } from "vitest";

import {
  buildAdminConversationRooms,
  filterAdminConversationRooms,
  loadAdminConversationRooms,
  loadAdminOverview,
} from "@/app/admin/admin-data-adapter";
import { buildProgramSnapshot } from "@/features/programs/model";
import type { OARepository } from "@/lib/repositories";
import {
  createMockRepositoryState,
  MOCK_PROGRAM_IDS,
} from "@/lib/repositories/mock-data";
import type { ProgramMessage, ProgramSnapshot } from "@/types";

function fixtures() {
  const state = createMockRepositoryState();
  const snapshots = [
    MOCK_PROGRAM_IDS.talk,
    MOCK_PROGRAM_IDS.exhibition,
    MOCK_PROGRAM_IDS.workshop,
    MOCK_PROGRAM_IDS.reading,
  ].map((programId): ProgramSnapshot => {
    const program = state.programs.find((candidate) => candidate.id === programId);
    if (!program) throw new Error(`Missing fixture ${programId}`);
    return buildProgramSnapshot(
      program,
      state.users,
      state.participations,
      state.records,
      "2026-08-19T00:00:00.000Z",
    );
  });

  const messages: ProgramMessage[] = [
    {
      id: "question-exhibition",
      programId: MOCK_PROGRAM_IDS.exhibition,
      authorId: "user-member-1",
      type: "QUESTION",
      content: "집결 장소가 어디인가요?",
      parentId: null,
      isPinned: false,
      isHidden: false,
      createdAt: "2026-08-19T08:00:00.000Z",
      editedAt: null,
    },
    {
      id: "notice-exhibition",
      programId: MOCK_PROGRAM_IDS.exhibition,
      authorId: "user-host-exhibition",
      type: "NOTICE",
      content: "집결 장소를 확인해 주세요.",
      parentId: null,
      isPinned: true,
      isHidden: false,
      createdAt: "2026-08-19T08:10:00.000Z",
      editedAt: null,
    },
    {
      id: "reply-exhibition",
      programId: MOCK_PROGRAM_IDS.exhibition,
      authorId: "user-host-exhibition",
      type: "QUESTION",
      content: "1층 로비에서 만납니다.",
      parentId: "question-exhibition",
      isPinned: false,
      isHidden: false,
      createdAt: "2026-08-19T08:20:00.000Z",
      editedAt: null,
    },
    {
      id: "question-reading",
      programId: MOCK_PROGRAM_IDS.reading,
      authorId: "user-member-2",
      type: "QUESTION",
      content: "이번 주 범위가 어디까지인가요?",
      parentId: null,
      isPinned: false,
      isHidden: false,
      createdAt: "2026-08-19T09:00:00.000Z",
      editedAt: null,
    },
  ];

  return { state, snapshots, messages };
}

describe("Admin conversation data adapter", () => {
  it("aggregates room state, resolves the latest author, and keeps empty rooms last", () => {
    const { state, snapshots, messages } = fixtures();
    const rooms = buildAdminConversationRooms(snapshots, messages, state.users);

    expect(rooms.slice(0, 2).map((room) => room.snapshot.program.id)).toEqual([
      MOCK_PROGRAM_IDS.reading,
      MOCK_PROGRAM_IDS.exhibition,
    ]);
    expect(rooms[0]).toMatchObject({
      latestMessage: { id: "question-reading" },
      latestAuthorName: "한유나",
      messageCount: 1,
      pinnedNoticeCount: 0,
      unansweredQuestionCount: 1,
    });
    expect(rooms[1]).toMatchObject({
      latestMessage: { id: "reply-exhibition" },
      latestAuthorName: "김서연",
      messageCount: 3,
      pinnedNoticeCount: 1,
      unansweredQuestionCount: 0,
    });
    expect(rooms.slice(-2).every((room) => room.latestMessage === null)).toBe(true);
    expect(new Set(rooms.slice(-2).map((room) => room.snapshot.program.id))).toEqual(
      new Set([MOCK_PROGRAM_IDS.talk, MOCK_PROGRAM_IDS.workshop]),
    );
  });

  it("filters Gathering rooms with the existing category taxonomy", () => {
    const { state, snapshots, messages } = fixtures();
    const rooms = buildAdminConversationRooms(snapshots, messages, state.users);

    expect(filterAdminConversationRooms(rooms, "GATHERING", "ALL")).toHaveLength(2);
    expect(
      filterAdminConversationRooms(rooms, "GATHERING", "WORKSHOP")
        .map((room) => room.snapshot.program.id),
    ).toEqual([MOCK_PROGRAM_IDS.workshop]);
    expect(filterAdminConversationRooms(rooms, "TALK")).toHaveLength(1);
  });

  it("loads the Admin-only program and message collections with the authenticated viewer", async () => {
    const { state, snapshots, messages } = fixtures();
    const repository = {
      listAdminPrograms: vi.fn().mockResolvedValue(snapshots),
      listAdminMessages: vi.fn().mockResolvedValue(messages),
      listUsers: vi.fn().mockResolvedValue(state.users),
    } as unknown as OARepository;
    const now = "2026-08-20T00:00:00.000Z";

    await expect(loadAdminConversationRooms(repository, "user-admin", now))
      .resolves.toHaveLength(4);
    expect(repository.listAdminPrograms).toHaveBeenCalledWith("user-admin", now);
    expect(repository.listAdminMessages).toHaveBeenCalledWith("user-admin");
    expect(repository.listUsers).toHaveBeenCalledWith("user-admin");
  });

  it("builds the Admin overview from Admin-only collections including unanswered questions", async () => {
    const { state, snapshots, messages } = fixtures();
    const registrations = state.users.map((user) => ({
      user,
      participatingSeasons: state.participatingSeasonsByUserId[user.id] ?? [],
    }));
    const repository = {
      listApprovalQueue: vi.fn().mockResolvedValue([{ id: "approval-1" }]),
      listAdminMemberRegistrations: vi.fn().mockResolvedValue(registrations),
      listAdminPrograms: vi.fn().mockResolvedValue(snapshots),
      listAdminMessages: vi.fn().mockResolvedValue(messages),
    } as unknown as OARepository;

    await expect(
      loadAdminOverview(repository, "user-admin", "2026-08-20T00:00:00.000Z"),
    ).resolves.toEqual({
      approvals: 1,
      pendingMembers: 1,
      recordRequired: 0,
      unansweredQuestions: 1,
    });
  });
});
