import { MOCK_CURRENT_USER_ID } from "@/constants";
import {
  BrowserMockRepository,
  createMockRepositoryState,
  MOCK_PENDING_USER_ID,
  MOCK_PROGRAM_IDS,
} from "@/lib/repositories";
import type { CreateGatheringInput } from "@/types";
import { describe, expect, it } from "vitest";

const now = "2026-08-09T10:00:00+09:00";

function repository() {
  return new BrowserMockRepository({
    storageKey: `oa:admin-test:${crypto.randomUUID()}`,
    initialState: createMockRepositoryState(),
  });
}

const draftInput: CreateGatheringInput = {
  title: "을지로 재료 산책",
  category: "FIELD_TRIP",
  description: "도시의 재료와 표면을 함께 관찰합니다.",
  startAt: "2026-09-05T14:00:00+09:00",
  endAt: "2026-09-05T17:00:00+09:00",
  location: "을지로입구역",
  meetingPoint: "1번 출구",
  mapUrl: null,
  capacity: 8,
  recruitmentDeadline: null,
  waitlistEnabled: true,
  cost: { type: "FREE" },
  bringItems: "필기도구",
  notice: null,
};

describe("BrowserMockRepository Admin operations", () => {
  it("requires ADMIN for every Admin query and mutation", async () => {
    const repo = repository();

    await expect(repo.listAdminPrograms(MOCK_CURRENT_USER_ID, now)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(repo.listAdminMessages(MOCK_CURRENT_USER_ID)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      repo.listAdminMemberRegistrations(MOCK_CURRENT_USER_ID),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(repo.listAdminRecords(MOCK_CURRENT_USER_ID)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      repo.approvePendingMember(MOCK_PENDING_USER_ID, MOCK_CURRENT_USER_ID, now),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("includes DRAFT Programs in the Admin list while public Programs stay filtered", async () => {
    const repo = repository();
    const proposal = await repo.submitGatheringForApproval(
      draftInput,
      MOCK_CURRENT_USER_ID,
      now,
    );

    await expect(repo.listPrograms({}, now)).resolves.not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          program: expect.objectContaining({ id: proposal.snapshot.program.id }),
        }),
      ]),
    );
    await expect(repo.listAdminPrograms("user-admin", now)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          program: expect.objectContaining({
            id: proposal.snapshot.program.id,
            status: "DRAFT",
          }),
        }),
      ]),
    );
  });

  it("returns seeded Program conversations with types, threads, and Program context", async () => {
    const repo = repository();
    const messages = await repo.listAdminMessages("user-admin");
    const questionIds = new Set(
      messages.filter((message) => message.type === "QUESTION").map((message) => message.id),
    );
    const reply = messages.find((message) => message.parentId !== null);

    expect(new Set(messages.map((message) => message.type))).toEqual(
      new Set(["NOTICE", "QUESTION", "CHAT"]),
    );
    expect(messages.map((message) => message.programId)).toEqual(
      expect.arrayContaining([MOCK_PROGRAM_IDS.exhibition, MOCK_PROGRAM_IDS.reading]),
    );
    expect(reply?.parentId).toBeTruthy();
    expect(questionIds.has(reply?.parentId ?? "")).toBe(true);
    expect(messages.map((message) => Date.parse(message.createdAt))).toEqual(
      [...messages]
        .map((message) => Date.parse(message.createdAt))
        .sort((left, right) => right - left),
    );
  });

  it("approves only PENDING Members and retains participating seasons", async () => {
    const repo = repository();
    const registrations = await repo.listAdminMemberRegistrations("user-admin");
    const pending = registrations.find(
      (registration) => registration.user.id === MOCK_PENDING_USER_ID,
    );

    expect(pending).toMatchObject({
      user: { status: "PENDING" },
      participatingSeasons: ["3기"],
    });

    const approved = await repo.approvePendingMember(
      MOCK_PENDING_USER_ID,
      "user-admin",
      now,
    );
    expect(approved).toMatchObject({
      user: { id: MOCK_PENDING_USER_ID, status: "MEMBER" },
      participatingSeasons: ["3기"],
    });
    await expect(repo.getUserById(MOCK_PENDING_USER_ID)).resolves.toMatchObject({
      status: "MEMBER",
    });
    await expect(
      repo.approvePendingMember(MOCK_PENDING_USER_ID, "user-admin", now),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(
      repo.approvePendingMember(MOCK_CURRENT_USER_ID, "user-admin", now),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(
      repo.approvePendingMember("missing-user", "user-admin", now),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns Admin records without exposing them to a normal Member", async () => {
    const repo = repository();

    await expect(repo.listAdminRecords("user-admin")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ programId: MOCK_PROGRAM_IDS.talk }),
      ]),
    );
    await expect(repo.listAdminRecords(MOCK_CURRENT_USER_ID)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
