import { describe, expect, it } from "vitest";
import { MOCK_CURRENT_USER_ID } from "@/constants";
import {
  BrowserMockRepository,
  createMockRepositoryState,
} from "@/lib/repositories";
import type { CreateGatheringInput } from "@/types";

const draft: CreateGatheringInput = {
  title: "도시 경계 걷기",
  category: "FIELD_TRIP",
  description: "도시의 경계 조건을 함께 살펴봅니다.",
  startAt: "2026-09-15T14:00:00+09:00",
  endAt: "2026-09-15T17:00:00+09:00",
  location: "서울숲역",
  meetingPoint: "3번 출구",
  mapUrl: null,
  capacity: 8,
  recruitmentDeadline: null,
  waitlistEnabled: true,
  cost: { type: "FREE" },
  bringItems: null,
  notice: null,
};

const submittedAt = "2026-08-19T09:00:00+09:00";
const approvedAt = "2026-08-19T10:00:00+09:00";
const revisedAt = "2026-08-20T09:00:00+09:00";

async function approvedGathering() {
  const repository = new BrowserMockRepository({
    storageKey: `oa:revision-test:${crypto.randomUUID()}`,
    initialState: createMockRepositoryState(),
  });
  const submitted = await repository.submitGatheringForApproval(
    draft,
    MOCK_CURRENT_USER_ID,
    submittedAt,
  );
  const programId = submitted.snapshot.program.id;
  await repository.reviewProgramApproval(
    programId,
    { status: "APPROVED" },
    "user-admin",
    approvedAt,
  );
  return { repository, programId };
}

describe("approved Gathering material revision lifecycle", () => {
  it("keeps the approved public version live until Admin atomically promotes the revision", async () => {
    const { repository, programId } = await approvedGathering();
    const revisedStartAt = "2026-09-16T14:00:00+09:00";

    const updateResult = await repository.updateGathering(
      programId,
      {
        ...draft,
        startAt: revisedStartAt,
        endAt: "2026-09-16T17:00:00+09:00",
      },
      MOCK_CURRENT_USER_ID,
      revisedAt,
    );

    expect(updateResult).toMatchObject({ status: "OPEN", startAt: draft.startAt });
    await expect(repository.getProgramById(programId)).resolves.toMatchObject({
      status: "OPEN",
      startAt: draft.startAt,
    });
    await expect(repository.listPrograms({}, revisedAt)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          program: expect.objectContaining({ id: programId, startAt: draft.startAt }),
        }),
      ]),
    );
    await expect(
      repository.getGatheringRevision(programId, MOCK_CURRENT_USER_ID),
    ).resolves.toMatchObject({
      proposedProgram: expect.objectContaining({ startAt: revisedStartAt }),
      changedFields: expect.arrayContaining(["startAt"]),
    });
    await expect(repository.listApprovalQueue("user-admin", undefined, revisedAt)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          snapshot: expect.objectContaining({
            program: expect.objectContaining({ id: programId, startAt: revisedStartAt }),
          }),
          revision: expect.objectContaining({ programId }),
        }),
      ]),
    );
    await expect(
      repository.joinProgram(programId, "user-member-1", revisedAt),
    ).resolves.toMatchObject({ placement: "CONFIRMED" });

    await repository.reviewProgramApproval(
      programId,
      { status: "APPROVED" },
      "user-admin",
      "2026-08-21T09:00:00+09:00",
    );

    await expect(repository.getProgramById(programId)).resolves.toMatchObject({
      status: "OPEN",
      startAt: revisedStartAt,
    });
    await expect(
      repository.getGatheringRevision(programId, MOCK_CURRENT_USER_ID),
    ).resolves.toBeNull();
  });

  it("keeps public data unchanged through CHANGES_REQUESTED and revision resubmission", async () => {
    const { repository, programId } = await approvedGathering();
    const firstRevision = "2026-09-16T14:00:00+09:00";
    const resubmittedRevision = "2026-09-17T14:00:00+09:00";
    await repository.updateGathering(
      programId,
      {
        ...draft,
        startAt: firstRevision,
        endAt: "2026-09-16T17:00:00+09:00",
      },
      MOCK_CURRENT_USER_ID,
      revisedAt,
    );

    await repository.reviewProgramApproval(
      programId,
      { status: "CHANGES_REQUESTED", comment: "날짜를 다시 확인해 주세요." },
      "user-admin",
      "2026-08-21T09:00:00+09:00",
    );
    await expect(repository.getProgramById(programId)).resolves.toMatchObject({
      status: "OPEN",
      startAt: draft.startAt,
    });
    await expect(
      repository.getGatheringRevision(programId, MOCK_CURRENT_USER_ID),
    ).resolves.toMatchObject({
      proposedProgram: expect.objectContaining({ startAt: firstRevision }),
    });

    const resubmitted = await repository.resubmitGatheringForApproval(
      programId,
      {
        ...draft,
        startAt: resubmittedRevision,
        endAt: "2026-09-17T17:00:00+09:00",
        meetingPoint: "4번 출구",
      },
      MOCK_CURRENT_USER_ID,
      "2026-08-22T09:00:00+09:00",
    );
    expect(resubmitted).toMatchObject({
      approval: expect.objectContaining({ status: "PENDING" }),
      snapshot: expect.objectContaining({
        program: expect.objectContaining({ startAt: resubmittedRevision }),
      }),
    });
    await expect(repository.getProgramById(programId)).resolves.toMatchObject({
      startAt: draft.startAt,
      detail: expect.objectContaining({ meetingPoint: draft.meetingPoint }),
    });

    await repository.reviewProgramApproval(
      programId,
      { status: "APPROVED" },
      "user-admin",
      "2026-08-23T09:00:00+09:00",
    );
    await expect(repository.getProgramById(programId)).resolves.toMatchObject({
      startAt: resubmittedRevision,
      detail: expect.objectContaining({ meetingPoint: "4번 출구" }),
    });
  });

  it("rejects only the revision while the published Program remains usable", async () => {
    const { repository, programId } = await approvedGathering();
    await repository.updateGathering(
      programId,
      { ...draft, location: "응봉역" },
      MOCK_CURRENT_USER_ID,
      revisedAt,
    );
    await repository.reviewProgramApproval(
      programId,
      { status: "REJECTED", comment: "장소 운영 조건을 확인할 수 없습니다." },
      "user-admin",
      "2026-08-21T09:00:00+09:00",
    );

    await expect(repository.getProgramById(programId)).resolves.toMatchObject({
      status: "OPEN",
      location: draft.location,
    });
    await expect(
      repository.getProgramApproval(programId, MOCK_CURRENT_USER_ID),
    ).resolves.toMatchObject({ status: "REJECTED", publishedAt: approvedAt });
    await expect(
      repository.getGatheringRevision(programId, MOCK_CURRENT_USER_ID),
    ).resolves.toMatchObject({
      proposedProgram: expect.objectContaining({ location: "응봉역" }),
    });
    await expect(
      repository.joinProgram(programId, "user-member-1", revisedAt),
    ).resolves.toMatchObject({ placement: "CONFIRMED" });
  });

  it("applies meetingPoint immediately as an operational UPDATED event", async () => {
    const { repository, programId } = await approvedGathering();
    const updated = await repository.updateGathering(
      programId,
      { ...draft, meetingPoint: "서울숲역 4번 출구 앞" },
      MOCK_CURRENT_USER_ID,
      revisedAt,
    );

    expect(updated).toMatchObject({
      status: "OPEN",
      detail: expect.objectContaining({ meetingPoint: "서울숲역 4번 출구 앞" }),
    });
    await expect(
      repository.getProgramApproval(programId, MOCK_CURRENT_USER_ID),
    ).resolves.toMatchObject({ status: "APPROVED" });
    await expect(
      repository.getGatheringRevision(programId, MOCK_CURRENT_USER_ID),
    ).resolves.toBeNull();
    const activities = await repository.listProgramActivities(
      programId,
      MOCK_CURRENT_USER_ID,
    );
    expect(
      activities.filter(
        (activity) =>
          activity.type === "UPDATED" &&
          activity.metadata.classification === "OPERATIONAL" &&
          activity.metadata.applied === true,
      ),
    ).toHaveLength(1);
  });
});
