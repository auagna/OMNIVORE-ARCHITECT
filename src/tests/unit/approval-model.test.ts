import { describe, expect, it } from "vitest";

import { APPROVAL_STATUSES, PAGE_CONTENT_KEYS } from "@/constants";
import {
  createMockRepositoryState,
  hasApprovalSensitiveGatheringChanges,
  MOCK_PROGRAM_IDS,
} from "@/lib/repositories";
import {
  canPublishProgramDirectly,
  canReviewProgramApproval,
  canSubmitGatheringProposal,
} from "@/lib/permissions";
import type { CreateGatheringInput, GatheringProgram } from "@/types";

function approvedWorkshop() {
  const state = createMockRepositoryState();
  const program = state.programs.find(
    (candidate) => candidate.id === MOCK_PROGRAM_IDS.workshop,
  );
  if (!program || program.type !== "GATHERING") {
    throw new Error("Missing Gathering fixture");
  }
  return { state, program };
}

function inputFrom(program: GatheringProgram): CreateGatheringInput {
  const cost: CreateGatheringInput["cost"] = (() => {
    const persistedCost = program.detail.cost;
    if (persistedCost.type !== "HOST_COLLECT") return persistedCost;
    const paymentInfo = persistedCost.paymentInfo;
    if (!paymentInfo) {
      throw new Error("Create fixture requires restricted HOST_COLLECT payment info");
    }
    return { ...persistedCost, paymentInfo };
  })();

  return {
    title: program.title,
    category: program.detail.category,
    description: program.description,
    startAt: program.startAt,
    endAt: program.endAt,
    location: program.location,
    meetingPoint: program.detail.meetingPoint,
    mapUrl: program.mapUrl,
    capacity: program.capacity ?? 1,
    recruitmentDeadline: program.detail.recruitmentDeadline,
    waitlistEnabled: program.detail.waitlistEnabled,
    cost,
    bringItems: program.detail.bringItems,
    notice: program.detail.notice,
  };
}

describe("approval model", () => {
  it("keeps approval and PageContent vocabularies explicit", () => {
    expect(APPROVAL_STATUSES).toEqual([
      "NOT_REQUIRED",
      "DRAFT",
      "PENDING",
      "CHANGES_REQUESTED",
      "APPROVED",
      "REJECTED",
    ]);
    expect(PAGE_CONTENT_KEYS).toEqual([
      "home",
      "programs",
      "talk",
      "reading",
      "gathering",
      "members",
      "about",
    ]);
  });

  it("seeds schema v4 with one approval per Program and public PageContent", () => {
    const state = createMockRepositoryState();

    expect(state.schemaVersion).toBe(4);
    expect(state.approvals).toHaveLength(state.programs.length);
    expect(state.pageContents.map((content) => content.key)).toEqual(PAGE_CONTENT_KEYS);
  });

  it("separates Member proposal permission from Admin publish/review permission", () => {
    const state = createMockRepositoryState();
    const member = state.users.find((user) => user.id === "user-current") ?? null;
    const admin = state.users.find((user) => user.id === "user-admin") ?? null;

    expect(canSubmitGatheringProposal(member)).toBe(true);
    expect(canSubmitGatheringProposal(admin)).toBe(false);
    expect(canPublishProgramDirectly(member)).toBe(false);
    expect(canPublishProgramDirectly(admin)).toBe(true);
    expect(canReviewProgramApproval(member)).toBe(false);
    expect(canReviewProgramApproval(admin)).toBe(true);
  });

  it("requires reapproval only for material fields", () => {
    const { program } = approvedWorkshop();
    const input = inputFrom(program);

    expect(
      hasApprovalSensitiveGatheringChanges(program, {
        ...input,
        title: "오탈자를 수정한 제목",
        description: "설명을 보완했습니다.",
      }),
    ).toBe(false);
    expect(
      hasApprovalSensitiveGatheringChanges(program, {
        ...input,
        location: "변경된 장소",
      }),
    ).toBe(true);
    expect(
      hasApprovalSensitiveGatheringChanges(program, {
        ...input,
        capacity: input.capacity + 1,
      }),
    ).toBe(false);

    if (input.cost.type !== "HOST_COLLECT") {
      throw new Error("Expected HOST_COLLECT fixture");
    }
    expect(
      hasApprovalSensitiveGatheringChanges(program, {
        ...input,
        cost: { ...input.cost, participationFee: input.cost.participationFee + 1000 },
      }),
    ).toBe(true);
    expect(
      hasApprovalSensitiveGatheringChanges(program, {
        ...input,
        cost: { ...input.cost, paymentInfo: "변경된 입금 정보" },
      }),
    ).toBe(true);
    expect(
      hasApprovalSensitiveGatheringChanges(program, {
        ...input,
        cost: { ...input.cost, cancellationPolicy: "변경된 환불 기준" },
      }),
    ).toBe(true);
  });
});
