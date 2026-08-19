import { describe, expect, it } from "vitest";

import {
  classifyGatheringChanges,
  getProgramDetailTabs,
} from "@/features/programs/domain";
import { createMockRepositoryState, MOCK_PROGRAM_IDS } from "@/lib/repositories";
import type { CreateGatheringInput, GatheringProgram } from "@/types";

function fixture(): { program: GatheringProgram; input: CreateGatheringInput } {
  const state = createMockRepositoryState();
  const program = state.programs.find(
    (candidate) => candidate.id === MOCK_PROGRAM_IDS.workshop,
  );
  if (!program || program.type !== "GATHERING") {
    throw new Error("Missing Workshop Gathering fixture");
  }
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
    program,
    input: {
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
    },
  };
}

describe("Gathering re-approval policy", () => {
  it("returns NONE for an unchanged Gathering", () => {
    const { program, input } = fixture();

    expect(classifyGatheringChanges(program, input)).toEqual({
      classification: "NONE",
      changedFields: [],
      materialFields: [],
      operationalFields: [],
      requiresReapproval: false,
    });
  });

  it.each([
    ["startAt", { startAt: "2026-09-01T09:00:00.000Z" }],
    ["endAt", { endAt: "2026-09-01T12:00:00.000Z" }],
    ["location", { location: "변경된 장소" }],
  ] as const)("classifies %s as MATERIAL", (field, change) => {
    const { program, input } = fixture();
    const result = classifyGatheringChanges(program, { ...input, ...change });

    expect(result.classification).toBe("MATERIAL");
    expect(result.materialFields).toContain(field);
    expect(result.requiresReapproval).toBe(true);
  });

  it("classifies cost type, participation fee, payment method and refund policy as MATERIAL", () => {
    const { program, input } = fixture();
    if (input.cost.type !== "HOST_COLLECT") {
      throw new Error("Expected HOST_COLLECT fixture");
    }

    expect(
      classifyGatheringChanges(program, { ...input, cost: { type: "FREE" } })
        .materialFields,
    ).toContain("costType");

    const result = classifyGatheringChanges(program, {
      ...input,
      cost: {
        ...input.cost,
        participationFee: input.cost.participationFee + 1_000,
        paymentInfo: "변경된 입금 방법",
        cancellationPolicy: "변경된 취소 및 환불 정책",
      },
    });
    expect(result.classification).toBe("MATERIAL");
    expect(result.materialFields).toEqual([
      "participationFee",
      "paymentInfo",
      "cancellationPolicy",
    ]);
  });

  it("keeps capacity, meeting point, description, bring items and notice OPERATIONAL", () => {
    const { program, input } = fixture();
    const result = classifyGatheringChanges(program, {
      ...input,
      title: `${input.title} `,
      capacity: input.capacity + 2,
      meetingPoint: "2층 안내 데스크",
      description: "운영 설명을 보완했습니다.",
      bringItems: "작업 장갑",
      notice: "10분 일찍 도착해 주세요.",
    });

    expect(result.classification).toBe("OPERATIONAL");
    expect(result.materialFields).toEqual([]);
    expect(result.operationalFields).toEqual([
      "description",
      "meetingPoint",
      "capacity",
      "bringItems",
      "notice",
    ]);
    expect(result.requiresReapproval).toBe(false);
  });
});

describe("Program detail tab policy", () => {
  it("keeps active Programs on INFO / TALK / PEOPLE", () => {
    const { program } = fixture();

    expect(getProgramDetailTabs(program)).toEqual(["INFO", "TALK", "PEOPLE"]);
  });

  it("moves completed Programs to INFO / RECORD / TALK", () => {
    const { program } = fixture();

    expect(getProgramDetailTabs({ ...program, status: "COMPLETED" })).toEqual([
      "INFO",
      "RECORD",
      "TALK",
    ]);
  });
});
