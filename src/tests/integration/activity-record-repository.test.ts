import { describe, expect, it } from "vitest";
import { MOCK_CURRENT_USER_ID } from "@/constants";
import {
  BrowserMockRepository,
  createMockRepositoryState,
  MOCK_PROGRAM_IDS,
} from "@/lib/repositories";
import type { CreateGatheringInput } from "@/types";

const submittedAt = "2026-08-09T10:00:00+09:00";

const gatheringInput: CreateGatheringInput = {
  title: "한강 건축 산책",
  category: "FIELD_TRIP",
  description: "한강 주변의 공공 공간과 건축을 함께 걷습니다.",
  startAt: "2026-08-29T14:00:00+09:00",
  endAt: null,
  location: "뚝섬한강공원",
  meetingPoint: "7호선 2번 출구",
  mapUrl: null,
  capacity: 8,
  recruitmentDeadline: null,
  waitlistEnabled: true,
  cost: { type: "FREE" },
  bringItems: null,
  notice: null,
};

function repository() {
  return new BrowserMockRepository({
    storageKey: `oa:activity-test:${crypto.randomUUID()}`,
    initialState: createMockRepositoryState(),
  });
}

describe("Program Activity and v3.1 Record repository", () => {
  it("records proposal review lifecycle events atomically", async () => {
    const repo = repository();
    const submitted = await repo.submitGatheringForApproval(
      gatheringInput,
      MOCK_CURRENT_USER_ID,
      submittedAt,
    );
    const programId = submitted.snapshot.program.id;

    await repo.reviewProgramApproval(
      programId,
      { status: "CHANGES_REQUESTED", comment: "집결 위치를 명확히 적어 주세요." },
      "user-admin",
      "2026-08-10T10:00:00+09:00",
    );
    await repo.resubmitGatheringForApproval(
      programId,
      { ...gatheringInput, meetingPoint: "뚝섬역 2번 출구" },
      MOCK_CURRENT_USER_ID,
      "2026-08-11T10:00:00+09:00",
    );
    await repo.reviewProgramApproval(
      programId,
      { status: "APPROVED" },
      "user-admin",
      "2026-08-12T10:00:00+09:00",
    );

    const activities = await repo.listProgramActivities(programId, MOCK_CURRENT_USER_ID);
    expect(activities.map((activity) => activity.type)).toEqual(
      expect.arrayContaining([
        "CREATED",
        "SUBMITTED",
        "CHANGES_REQUESTED",
        "APPROVED",
      ]),
    );
    expect(activities.filter((activity) => activity.type === "SUBMITTED")).toHaveLength(2);
  });

  it("records a rejected proposal without publishing it", async () => {
    const repo = repository();
    const submitted = await repo.submitGatheringForApproval(
      gatheringInput,
      MOCK_CURRENT_USER_ID,
      submittedAt,
    );
    const programId = submitted.snapshot.program.id;
    await repo.reviewProgramApproval(
      programId,
      { status: "REJECTED", comment: "운영 조건을 충족하지 않습니다." },
      "user-admin",
      "2026-08-10T10:00:00+09:00",
    );

    const activities = await repo.listProgramActivities(programId, MOCK_CURRENT_USER_ID);
    expect(activities.filter((activity) => activity.type === "REJECTED")).toHaveLength(1);
    await expect(repo.getProgramById(programId)).resolves.toBeNull();
  });

  it("records operational updates once for an identical mutation retry", async () => {
    const repo = repository();
    const submitted = await repo.submitGatheringForApproval(
      gatheringInput,
      MOCK_CURRENT_USER_ID,
      submittedAt,
    );
    const programId = submitted.snapshot.program.id;
    await repo.reviewProgramApproval(
      programId,
      { status: "APPROVED" },
      "user-admin",
      "2026-08-10T10:00:00+09:00",
    );
    const input = { ...gatheringInput, description: "보완한 운영 설명입니다." };
    const updatedAt = "2026-08-11T10:00:00+09:00";

    await repo.updateGathering(programId, input, MOCK_CURRENT_USER_ID, updatedAt);
    await repo.updateGathering(programId, input, MOCK_CURRENT_USER_ID, updatedAt);

    const activities = await repo.listProgramActivities(programId, MOCK_CURRENT_USER_ID);
    expect(activities.filter((activity) => activity.type === "UPDATED")).toHaveLength(1);
  });

  it("stores an approved material edit as PENDING without replacing the public version", async () => {
    const repo = repository();
    const submitted = await repo.submitGatheringForApproval(
      gatheringInput,
      MOCK_CURRENT_USER_ID,
      submittedAt,
    );
    const programId = submitted.snapshot.program.id;
    await repo.reviewProgramApproval(
      programId,
      { status: "APPROVED" },
      "user-admin",
      "2026-08-10T10:00:00+09:00",
    );

    const updated = await repo.updateGathering(
      programId,
      { ...gatheringInput, startAt: "2026-08-30T14:00:00+09:00" },
      MOCK_CURRENT_USER_ID,
      "2026-08-11T10:00:00+09:00",
    );

    expect(updated).toMatchObject({
      status: "OPEN",
      startAt: gatheringInput.startAt,
    });
    await expect(
      repo.getProgramApproval(programId, MOCK_CURRENT_USER_ID),
    ).resolves.toMatchObject({
      status: "PENDING",
      reviewerId: null,
      publishedAt: "2026-08-10T10:00:00+09:00",
    });
    await expect(
      repo.getGatheringRevision(programId, MOCK_CURRENT_USER_ID),
    ).resolves.toMatchObject({
      proposedProgram: expect.objectContaining({
        startAt: "2026-08-30T14:00:00+09:00",
        status: "OPEN",
      }),
    });
    await expect(repo.getProgramById(programId)).resolves.toMatchObject({
      startAt: gatheringInput.startAt,
      status: "OPEN",
    });
    const activities = await repo.listProgramActivities(programId, MOCK_CURRENT_USER_ID);
    expect(
      activities.filter(
        (activity) =>
          activity.type === "SUBMITTED" && activity.metadata.reason === "MATERIAL_CHANGE",
      ),
    ).toHaveLength(1);
    expect(
      activities.find((activity) => activity.type === "UPDATED")?.metadata,
    ).toMatchObject({ classification: "MATERIAL" });
  });

  it("records joins and idempotent payment confirmation", async () => {
    const repo = repository();
    await repo.joinProgram(MOCK_PROGRAM_IDS.exhibition, MOCK_CURRENT_USER_ID, submittedAt);
    const joinActivities = await repo.listProgramActivities(
      MOCK_PROGRAM_IDS.exhibition,
      "user-host-exhibition",
    );
    expect(joinActivities.filter((activity) => activity.type === "JOINED")).toHaveLength(1);

    const pending = repo
      .getState()
      .participations.find(
        (participation) =>
          participation.programId === MOCK_PROGRAM_IDS.workshop &&
          participation.paymentStatus === "PENDING",
      );
    if (!pending) throw new Error("Missing pending HOST_COLLECT participation fixture");
    await repo.confirmParticipationPayment(
      pending.id,
      "user-host-workshop",
      "2026-08-10T10:00:00+09:00",
    );
    await repo.confirmParticipationPayment(
      pending.id,
      "user-host-workshop",
      "2026-08-10T10:00:00+09:00",
    );
    const paymentActivities = await repo.listProgramActivities(
      MOCK_PROGRAM_IDS.workshop,
      "user-host-workshop",
    );
    expect(
      paymentActivities.filter((activity) => activity.type === "PAYMENT_CONFIRMED"),
    ).toHaveLength(1);
  });

  it("cancels Participation once and records LEFT without duplication", async () => {
    const repo = repository();
    const joinedAt = "2026-08-19T08:00:00+09:00";
    const leftAt = "2026-08-19T08:05:00+09:00";

    await repo.joinProgram(
      MOCK_PROGRAM_IDS.exhibition,
      MOCK_CURRENT_USER_ID,
      joinedAt,
    );
    const posted = await repo.postProgramMessage(
      MOCK_PROGRAM_IDS.exhibition,
      { type: "CHAT", content: "전시장에서 뵙겠습니다." },
      MOCK_CURRENT_USER_ID,
      "2026-08-19T08:01:00+09:00",
    );
    const cancelled = await repo.cancelParticipation(
      MOCK_PROGRAM_IDS.exhibition,
      MOCK_CURRENT_USER_ID,
      leftAt,
    );
    const retry = await repo.cancelParticipation(
      MOCK_PROGRAM_IDS.exhibition,
      MOCK_CURRENT_USER_ID,
      leftAt,
    );

    expect(cancelled.status).toBe("CANCELLED");
    expect(retry.id).toBe(cancelled.id);
    await expect(
      repo.listProgramMessages(
        MOCK_PROGRAM_IDS.exhibition,
        MOCK_CURRENT_USER_ID,
      ),
    ).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: posted.id })]),
    );
    await expect(
      repo.postProgramMessage(
        MOCK_PROGRAM_IDS.exhibition,
        { type: "CHAT", content: "취소 후에는 작성할 수 없습니다." },
        MOCK_CURRENT_USER_ID,
        "2026-08-19T08:06:00+09:00",
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const activities = await repo.listProgramActivities(
      MOCK_PROGRAM_IDS.exhibition,
      "user-host-exhibition",
    );
    expect(activities.filter((activity) => activity.type === "LEFT")).toHaveLength(1);
  });

  it("de-dupes a retried Host Notice without losing a distinct Notice at the same time", async () => {
    const repo = repository();
    const postedAt = "2026-08-19T09:00:00+09:00";
    const input = {
      type: "NOTICE" as const,
      content: "집결 장소가 1층 로비로 변경되었습니다.",
      isPinned: true,
    };

    await expect(
      repo.listProgramMessages(
        MOCK_PROGRAM_IDS.exhibition,
        MOCK_CURRENT_USER_ID,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const first = await repo.postProgramMessage(
      MOCK_PROGRAM_IDS.exhibition,
      input,
      "user-host-exhibition",
      postedAt,
    );
    const retry = await repo.postProgramMessage(
      MOCK_PROGRAM_IDS.exhibition,
      input,
      "user-host-exhibition",
      postedAt,
    );
    expect(retry.id).toBe(first.id);
    const distinct = await repo.postProgramMessage(
      MOCK_PROGRAM_IDS.exhibition,
      { ...input, content: "전시 티켓은 개별 구매해 주세요." },
      "user-host-exhibition",
      postedAt,
    );
    expect(distinct.id).not.toBe(first.id);
    const activities = await repo.listProgramActivities(
      MOCK_PROGRAM_IDS.exhibition,
      "user-host-exhibition",
    );
    expect(activities.filter((activity) => activity.type === "NOTICE_POSTED")).toHaveLength(2);
    await expect(
      repo.postProgramMessage(
        MOCK_PROGRAM_IDS.exhibition,
        input,
        "user-member-1",
        postedAt,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("accepts WHAT-only Record and clears RECORD_REQUIRED", async () => {
    const repo = repository();
    const programId = MOCK_PROGRAM_IDS.workshop;
    await repo.setProgramStatus(
      programId,
      "COMPLETED",
      "user-admin",
      "2026-08-18T18:00:00+09:00",
    );
    await expect(
      repo.getProgramSnapshotById(programId, submittedAt, "user-host-workshop"),
    ).resolves.toMatchObject({ displayStatus: "RECORD_REQUIRED" });
    await expect(repo.listMyActions("user-host-workshop", submittedAt)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "RECORD_REQUIRED", programId })]),
    );

    const created = await repo.createRecord(
      programId,
      { what: "작은 목재 오브젝트를 여섯 명의 멤버가 함께 만들었다." },
      "user-host-workshop",
      "2026-08-18T18:01:00+09:00",
    );

    expect(created.record).toMatchObject({
      what: "작은 목재 오브젝트를 여섯 명의 멤버가 함께 만들었다.",
      found: null,
      summary: "작은 목재 오브젝트를 여섯 명의 멤버가 함께 만들었다.",
    });
    expect(created.materials).toEqual([]);
    const updated = await repo.updateRecord(
      programId,
      {
        what: created.record.what,
        found: "목재 결구 방식에 따라 손의 감각이 달라진다는 점을 발견했다.",
        materials: [{ type: "REFERENCE", url: "https://example.com/joinery" }],
      },
      "user-host-workshop",
      "2026-08-18T18:02:00+09:00",
    );
    expect(updated.record.found).toContain("결구 방식");
    expect(updated.materials).toEqual([
      expect.objectContaining({
        type: "REFERENCE",
        url: "https://example.com/joinery",
      }),
    ]);
    await expect(
      repo.getProgramSnapshotById(programId, submittedAt, "user-host-workshop"),
    ).resolves.toMatchObject({ displayStatus: "COMPLETED" });
    await expect(repo.listMyActions("user-host-workshop", submittedAt)).resolves.not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "RECORD_REQUIRED", programId })]),
    );
    const activities = await repo.listProgramActivities(programId, "user-host-workshop");
    expect(activities.map((activity) => activity.type)).toEqual(
      expect.arrayContaining(["COMPLETED", "RECORD_CREATED", "UPDATED"]),
    );
  });

  it("returns only actionable Home items in lifecycle priority order", async () => {
    const state = createMockRepositoryState();
    const hosted = state.programs.find(
      (program) => program.id === MOCK_PROGRAM_IDS.exhibition,
    );
    if (!hosted) throw new Error("Missing exhibition fixture");
    hosted.hostId = MOCK_CURRENT_USER_ID;
    hosted.status = "COMPLETED";
    hosted.updatedAt = "2026-08-12T10:00:00+09:00";
    state.participations.push({
      id: "participation-current-workshop-pending",
      programId: MOCK_PROGRAM_IDS.workshop,
      userId: MOCK_CURRENT_USER_ID,
      status: "CONFIRMED",
      paymentStatus: "PENDING",
      joinedAt: "2026-08-13T10:00:00+09:00",
    });
    const repo = new BrowserMockRepository({
      storageKey: `oa:home-action-test:${crypto.randomUUID()}`,
      initialState: state,
    });
    const submitted = await repo.submitGatheringForApproval(
      gatheringInput,
      MOCK_CURRENT_USER_ID,
      submittedAt,
    );
    await repo.reviewProgramApproval(
      submitted.snapshot.program.id,
      { status: "CHANGES_REQUESTED", comment: "시간을 다시 확인해 주세요." },
      "user-admin",
      "2026-08-14T10:00:00+09:00",
    );

    const actions = await repo.listMyActions(MOCK_CURRENT_USER_ID, submittedAt);
    expect(actions.map((action) => action.type)).toEqual([
      "CHANGES_REQUESTED",
      "RECORD_REQUIRED",
      "PAYMENT_REQUIRED",
    ]);
  });

  it("removes PAYMENT_REQUIRED when its Program is cancelled", async () => {
    const state = createMockRepositoryState();
    const workshop = state.programs.find(
      (program) => program.id === MOCK_PROGRAM_IDS.workshop,
    );
    if (!workshop) throw new Error("Missing workshop fixture");
    workshop.status = "CANCELLED";
    state.participations.push({
      id: "participation-current-workshop-cancelled-program",
      programId: workshop.id,
      userId: MOCK_CURRENT_USER_ID,
      status: "CONFIRMED",
      paymentStatus: "PENDING",
      joinedAt: "2026-08-13T10:00:00+09:00",
    });
    const repo = new BrowserMockRepository({
      storageKey: `oa:test:${crypto.randomUUID()}`,
      initialState: state,
    });

    await expect(repo.listMyActions(MOCK_CURRENT_USER_ID, submittedAt)).resolves.not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "PAYMENT_REQUIRED" })]),
    );
  });
});
