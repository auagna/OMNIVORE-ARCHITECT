import { describe, expect, it } from "vitest";

import {
  EMPTY_GATHERING_FORM,
  validateCreateGatheringInput,
  validateGatheringForm,
} from "@/features/gathering/model";
import type { GatheringFormValues } from "@/features/gathering/model";

const validBase: GatheringFormValues = {
  ...EMPTY_GATHERING_FORM,
  title: "한강 건축 산책",
  category: "FIELD_TRIP",
  date: "2026-08-29",
  startTime: "14:00",
  place: "뚝섬한강공원",
  capacity: "8",
  description: "한강 주변의 공공 공간과 건축을 함께 걷습니다.",
};

describe("Gathering cost validation", () => {
  it("accepts FREE without any additional cost fields", () => {
    const result = validateGatheringForm({
      ...validBase,
      costType: "FREE",
    });

    expect(result.success).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("accepts INDIVIDUAL_PURCHASE because all ticket fields are optional", () => {
    const result = validateGatheringForm({
      ...validBase,
      costType: "INDIVIDUAL_PURCHASE",
      estimatedPrice: "18000",
      purchaseUrl: "https://example.com/tickets",
      purchaseNote: "개별 예매 후 모바일 티켓을 준비해 주세요.",
    });

    expect(result.success).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("requires fee and payment information for HOST_COLLECT", () => {
    const result = validateGatheringForm({
      ...validBase,
      costType: "HOST_COLLECT",
    });

    expect(result.success).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "participationFee" }),
        expect.objectContaining({ field: "paymentInfo" }),
      ]),
    );
  });

  it("accepts HOST_COLLECT when its required fields are present", () => {
    const result = validateGatheringForm({
      ...validBase,
      costType: "HOST_COLLECT",
      participationFee: "25000",
      paymentInfo: "신한 000-000-000000 김OA",
      feeIncludes: "재료비",
    });

    expect(result.success).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("rejects unsafe URLs at the repository validation boundary", () => {
    const form = validateGatheringForm(validBase);
    if (!form.success) throw new Error("Expected valid fixture");

    const result = validateCreateGatheringInput({
      ...form.data,
      mapUrl: "javascript:alert(1)",
    });

    expect(result.success).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "mapUrl" })]),
    );
  });

  it("rejects registration deadlines after Program start", () => {
    const form = validateGatheringForm(validBase);
    if (!form.success) throw new Error("Expected valid fixture");

    const result = validateCreateGatheringInput({
      ...form.data,
      recruitmentDeadline: "2026-08-30T14:00:00+09:00",
    });

    expect(result.success).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "recruitmentDeadline" }),
      ]),
    );
  });
});
