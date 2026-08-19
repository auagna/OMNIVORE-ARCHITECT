import { describe, expect, it } from "vitest";
import { MOCK_CURRENT_USER_ID } from "@/constants";
import {
  BrowserMockRepository,
  createMockRepositoryState,
  MOCK_PROGRAM_IDS,
} from "@/lib/repositories";
import type { CreateGatheringInput } from "@/types";

const now = "2026-08-09T10:00:00+09:00";

function repository() {
  return new BrowserMockRepository({
    storageKey: `oa:test:${crypto.randomUUID()}`,
    initialState: createMockRepositoryState(),
  });
}

const gatheringInput: CreateGatheringInput = {
  title: "한강 건축 산책",
  category: "FIELD_TRIP",
  description: "한강 주변의 공공 공간과 건축을 함께 걷습니다.",
  startAt: "2026-08-29T14:00:00+09:00",
  endAt: null,
  location: "뚝섬한강공원",
  meetingPoint: null,
  mapUrl: null,
  capacity: 8,
  recruitmentDeadline: null,
  waitlistEnabled: true,
  cost: { type: "FREE" },
  bringItems: null,
  notice: null,
};

describe("BrowserMockRepository core flows", () => {
  it("joins an open Gathering and exposes it in MY upcoming", async () => {
    const repo = repository();
    const outcome = await repo.joinProgram(MOCK_PROGRAM_IDS.exhibition, MOCK_CURRENT_USER_ID, now);

    expect(outcome.placement).toBe("CONFIRMED");
    await expect(repo.listMyUpcoming(MOCK_CURRENT_USER_ID, now)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          program: expect.objectContaining({ id: MOCK_PROGRAM_IDS.exhibition }),
        }),
      ]),
    );
  });

  it("submits a Member Gathering as DRAFT + PENDING without public exposure", async () => {
    const repo = repository();
    const created = await repo.submitGatheringForApproval(
      gatheringInput,
      MOCK_CURRENT_USER_ID,
      now,
    );

    expect(created.snapshot.program.type).toBe("GATHERING");
    expect(created.snapshot.program.hostId).toBe(MOCK_CURRENT_USER_ID);
    expect(created.snapshot.program.status).toBe("DRAFT");
    expect(created.approval.status).toBe("PENDING");
    await expect(repo.listPrograms({}, now)).resolves.not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          program: expect.objectContaining({ id: created.snapshot.program.id }),
        }),
      ]),
    );
    await expect(repo.listMyProposals(MOCK_CURRENT_USER_ID, now)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          approval: expect.objectContaining({ status: "PENDING" }),
          snapshot: expect.objectContaining({
            program: expect.objectContaining({ id: created.snapshot.program.id }),
          }),
        }),
      ]),
    );
  });

  it("lets Admin publish directly with NOT_REQUIRED approval", async () => {
    const repo = repository();
    const created = await repo.publishGathering(gatheringInput, "user-admin", now);

    expect(created.status).toBe("OPEN");
    await expect(repo.getProgramApproval(created.id, "user-admin")).resolves.toEqual(
      expect.objectContaining({ status: "NOT_REQUIRED" }),
    );
    await expect(repo.publishGathering(gatheringInput, MOCK_CURRENT_USER_ID, now)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("supports request changes, resubmit, and approve as an atomic workflow", async () => {
    const repo = repository();
    const submitted = await repo.submitGatheringForApproval(
      gatheringInput,
      MOCK_CURRENT_USER_ID,
      now,
    );
    const programId = submitted.snapshot.program.id;

    await expect(repo.listApprovalQueue("user-admin", undefined, now)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          snapshot: expect.objectContaining({
            program: expect.objectContaining({ id: programId }),
          }),
        }),
      ]),
    );
    await expect(
      repo.reviewProgramApproval(
        programId,
        { status: "CHANGES_REQUESTED", comment: "  " },
        "user-admin",
        now,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const changesRequested = await repo.reviewProgramApproval(
      programId,
      {
        status: "CHANGES_REQUESTED",
        comment: "환불 기준을 더 명확하게 작성해 주세요.",
      },
      "user-admin",
      now,
    );
    expect(changesRequested.approval.status).toBe("CHANGES_REQUESTED");
    expect(changesRequested.snapshot.program.status).toBe("DRAFT");

    const resubmitted = await repo.resubmitGatheringForApproval(
      programId,
      {
        ...gatheringInput,
        cost: {
          type: "HOST_COLLECT",
          participationFee: 25000,
          feeIncludes: "재료비",
          paymentInfo: "신한 000-000-000000 오민서",
          paymentDeadline: null,
          cancellationPolicy: "행사 3일 전까지 전액 환불합니다.",
        },
      },
      MOCK_CURRENT_USER_ID,
      "2026-08-10T10:00:00+09:00",
    );
    expect(resubmitted.approval.status).toBe("PENDING");
    expect(resubmitted.approval.reviewComment).toBeNull();

    const approved = await repo.reviewProgramApproval(
      programId,
      { status: "APPROVED" },
      "user-admin",
      "2026-08-11T10:00:00+09:00",
    );
    expect(approved.approval.status).toBe("APPROVED");
    expect(approved.snapshot.program.status).toBe("OPEN");
    await expect(repo.getProgramSnapshotById(programId, now)).resolves.not.toBeNull();
  });

  it("keeps rejection terminal and prevents Host OPEN bypass", async () => {
    const repo = repository();
    const submitted = await repo.submitGatheringForApproval(
      gatheringInput,
      MOCK_CURRENT_USER_ID,
      now,
    );
    const programId = submitted.snapshot.program.id;

    await expect(
      repo.setProgramStatus(programId, "OPEN", MOCK_CURRENT_USER_ID, now),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const rejected = await repo.reviewProgramApproval(
      programId,
      { status: "REJECTED", comment: "운영 조건을 충족하지 않습니다." },
      "user-admin",
      now,
    );
    expect(rejected.approval.status).toBe("REJECTED");
    expect(rejected.snapshot.program.status).toBe("DRAFT");
    await expect(
      repo.resubmitGatheringForApproval(
        programId,
        gatheringInput,
        MOCK_CURRENT_USER_ID,
        now,
      ),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  it("rejects direct status tampering after a Program is cancelled", async () => {
    const repo = repository();

    await repo.setProgramStatus(
      MOCK_PROGRAM_IDS.workshop,
      "CANCELLED",
      "user-host-workshop",
      now,
    );

    await expect(
      repo.setProgramStatus(
        MOCK_PROGRAM_IDS.workshop,
        "CLOSED",
        "user-host-workshop",
        now,
      ),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(
      repo.updateGathering(
        MOCK_PROGRAM_IDS.workshop,
        gatheringInput,
        "user-host-workshop",
        now,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const pendingPayment = repo
      .getState()
      .participations.find(
        (participation) =>
          participation.programId === MOCK_PROGRAM_IDS.workshop &&
          participation.paymentStatus === "PENDING",
      );
    if (!pendingPayment) throw new Error("Missing pending workshop payment");
    await expect(
      repo.confirmParticipationPayment(
        pendingPayment.id,
        "user-host-workshop",
        now,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("guards direct DRAFT reads while allowing requester and Admin", async () => {
    const repo = repository();
    const submitted = await repo.submitGatheringForApproval(
      gatheringInput,
      MOCK_CURRENT_USER_ID,
      now,
    );
    const programId = submitted.snapshot.program.id;

    await expect(repo.getProgramById(programId)).resolves.toBeNull();
    await expect(repo.getProgramById(programId, "user-member-1")).resolves.toBeNull();
    await expect(repo.getProgramById(programId, MOCK_CURRENT_USER_ID)).resolves.toMatchObject({
      id: programId,
      status: "DRAFT",
    });
    await expect(repo.getProgramSnapshotById(programId, now, "user-admin")).resolves.toMatchObject({
      program: expect.objectContaining({ id: programId }),
    });
  });

  it("keeps operational edits approved and resubmits material edits", async () => {
    const repo = repository();
    const submitted = await repo.submitGatheringForApproval(
      gatheringInput,
      MOCK_CURRENT_USER_ID,
      now,
    );
    const programId = submitted.snapshot.program.id;
    await repo.reviewProgramApproval(programId, { status: "APPROVED" }, "user-admin", now);

    await expect(
      repo.updateGathering(
        programId,
        { ...gatheringInput, description: "보완한 설명입니다." },
        MOCK_CURRENT_USER_ID,
        now,
      ),
    ).resolves.toMatchObject({ description: "보완한 설명입니다." });
    await expect(
      repo.getProgramApproval(programId, MOCK_CURRENT_USER_ID),
    ).resolves.toMatchObject({ status: "APPROVED" });
    await expect(
      repo.updateGathering(
        programId,
        { ...gatheringInput, description: "보완한 설명입니다.", location: "변경된 장소" },
        MOCK_CURRENT_USER_ID,
        "2026-08-10T10:00:00+09:00",
      ),
    ).resolves.toMatchObject({ status: "OPEN", location: gatheringInput.location });
    await expect(
      repo.getProgramApproval(programId, MOCK_CURRENT_USER_ID),
    ).resolves.toMatchObject({ status: "PENDING" });
    await expect(
      repo.getGatheringRevision(programId, MOCK_CURRENT_USER_ID),
    ).resolves.toMatchObject({
      proposedProgram: expect.objectContaining({ location: "변경된 장소" }),
    });
  });

  it("supports Calendar ALL and MINE without exposing another Member's programs", async () => {
    const repo = repository();
    const from = "2026-08-01T00:00:00+09:00";
    const to = "2026-08-31T23:59:59+09:00";
    const all = await repo.listCalendarPrograms(from, to, now, "ALL", MOCK_CURRENT_USER_ID);
    const mineBeforeJoin = await repo.listCalendarPrograms(
      from,
      to,
      now,
      "MINE",
      MOCK_CURRENT_USER_ID,
    );
    expect(all.length).toBeGreaterThan(0);
    expect(mineBeforeJoin).toEqual([]);

    await repo.joinProgram(MOCK_PROGRAM_IDS.exhibition, MOCK_CURRENT_USER_ID, now);
    await expect(
      repo.listCalendarPrograms(from, to, now, "MINE", MOCK_CURRENT_USER_ID),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          program: expect.objectContaining({ id: MOCK_PROGRAM_IDS.exhibition }),
        }),
      ]),
    );
  });

  it("allows public PageContent reads and Admin-only updates", async () => {
    const repo = repository();
    const current = await repo.getPageContent("gathering");
    expect(current).not.toBeNull();
    if (!current) throw new Error("Missing Gathering PageContent seed");

    await expect(
      repo.updatePageContent(
        "gathering",
        { ...current, description: "승인된 Gathering을 확인합니다." },
        MOCK_CURRENT_USER_ID,
        now,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      repo.updatePageContent(
        "gathering",
        { ...current, description: "승인된 Gathering을 확인합니다." },
        "user-admin",
        now,
      ),
    ).resolves.toMatchObject({
      key: "gathering",
      description: "승인된 Gathering을 확인합니다.",
      updatedBy: "user-admin",
    });
  });

  it("places a full Gathering join on the waitlist", async () => {
    const state = createMockRepositoryState();
    const exhibition = state.programs.find((program) => program.id === MOCK_PROGRAM_IDS.exhibition);
    if (!exhibition) throw new Error("Missing exhibition seed");
    exhibition.capacity = 6;
    const repo = new BrowserMockRepository({
      storageKey: `oa:test:${crypto.randomUUID()}`,
      initialState: state,
    });

    const outcome = await repo.joinProgram(MOCK_PROGRAM_IDS.exhibition, MOCK_CURRENT_USER_ID, now);
    expect(outcome.placement).toBe("WAITLIST");
    expect(outcome.participation.paymentStatus).toBe("NOT_REQUIRED");
  });

  it("keeps Participation unique when a cancelled Member rejoins", async () => {
    const state = createMockRepositoryState();
    state.participations.push({
      id: "participation-cancelled-current",
      programId: MOCK_PROGRAM_IDS.exhibition,
      userId: MOCK_CURRENT_USER_ID,
      status: "CANCELLED",
      paymentStatus: "NOT_REQUIRED",
      joinedAt: "2026-08-08T09:00:00+09:00",
    });
    const repo = new BrowserMockRepository({
      storageKey: `oa:test:${crypto.randomUUID()}`,
      initialState: state,
    });

    await repo.joinProgram(MOCK_PROGRAM_IDS.exhibition, MOCK_CURRENT_USER_ID, now);
    const mine = (await repo.listParticipationsForProgram(MOCK_PROGRAM_IDS.exhibition))
      .filter((item) => item.userId === MOCK_CURRENT_USER_ID);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.status).toBe("CONFIRMED");
  });

  it("returns a redacted PEOPLE query without payment fields", async () => {
    const repo = repository();
    const people = await repo.listConfirmedParticipantUsers(MOCK_PROGRAM_IDS.workshop);

    expect(people.length).toBeGreaterThan(0);
    expect(people[0]).not.toHaveProperty("paymentStatus");
  });

  it("redacts the public Member directory and protects the full User list", async () => {
    const repo = repository();
    const members = await repo.listMemberDirectory();

    expect(members.length).toBeGreaterThan(0);
    expect(members[0]).not.toHaveProperty("email");
    expect(members[0]).not.toHaveProperty("status");
    await expect(repo.listUsers(MOCK_CURRENT_USER_ID)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(repo.listUsers("user-admin")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: MOCK_CURRENT_USER_ID, email: expect.any(String) }),
      ]),
    );
  });
});
