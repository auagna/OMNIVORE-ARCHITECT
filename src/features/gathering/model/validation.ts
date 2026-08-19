import {
  GATHERING_CATEGORIES,
  GATHERING_COST_TYPES,
  OA_UTC_OFFSET,
} from "../../../constants";
import type {
  CreateGatheringInput,
  GatheringCategory,
  GatheringCostType,
  GatheringProgram,
} from "../../../types";

export interface GatheringFormValues {
  title: string;
  category: GatheringCategory | "";
  date: string;
  startTime: string;
  endTime: string;
  place: string;
  meetingPoint: string;
  mapUrl: string;
  capacity: string;
  recruitmentDeadline: string;
  waitlistEnabled: boolean;
  costType: GatheringCostType;
  estimatedPrice: string;
  purchaseUrl: string;
  purchaseNote: string;
  participationFee: string;
  feeIncludes: string;
  paymentInfo: string;
  paymentDeadline: string;
  cancellationPolicy: string;
  description: string;
  bringItems: string;
  notice: string;
}

export const EMPTY_GATHERING_FORM: GatheringFormValues = {
  title: "",
  category: "",
  date: "",
  startTime: "",
  endTime: "",
  place: "",
  meetingPoint: "",
  mapUrl: "",
  capacity: "",
  recruitmentDeadline: "",
  waitlistEnabled: true,
  costType: "FREE",
  estimatedPrice: "",
  purchaseUrl: "",
  purchaseNote: "",
  participationFee: "",
  feeIncludes: "",
  paymentInfo: "",
  paymentDeadline: "",
  cancellationPolicy: "",
  description: "",
  bringItems: "",
  notice: "",
};

function localInputParts(value: string | null): { date: string; time: string; dateTime: string } {
  if (!value) return { date: "", time: "", dateTime: "" };
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).formatToParts(new Date(value));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = `${byType.year}-${byType.month}-${byType.day}`;
  const time = `${byType.hour}:${byType.minute}`;
  return { date, time, dateTime: `${date}T${time}` };
}

export function gatheringProgramToForm(program: GatheringProgram): GatheringFormValues {
  const start = localInputParts(program.startAt);
  const end = localInputParts(program.endAt);
  const recruitment = localInputParts(program.detail.recruitmentDeadline);
  const cost = program.detail.cost;
  const paymentDeadline = cost.type === "HOST_COLLECT"
    ? localInputParts(cost.paymentDeadline).dateTime
    : "";

  return {
    ...EMPTY_GATHERING_FORM,
    title: program.title,
    category: program.detail.category,
    date: start.date,
    startTime: start.time,
    endTime: end.time,
    place: program.location,
    meetingPoint: program.detail.meetingPoint ?? "",
    mapUrl: program.mapUrl ?? "",
    capacity: String(program.capacity ?? ""),
    recruitmentDeadline: recruitment.dateTime,
    waitlistEnabled: program.detail.waitlistEnabled,
    costType: cost.type,
    estimatedPrice: cost.type === "INDIVIDUAL_PURCHASE" && cost.estimatedPrice !== null
      ? String(cost.estimatedPrice)
      : "",
    purchaseUrl: cost.type === "INDIVIDUAL_PURCHASE" ? cost.purchaseUrl ?? "" : "",
    purchaseNote: cost.type === "INDIVIDUAL_PURCHASE" ? cost.purchaseNote ?? "" : "",
    participationFee: cost.type === "HOST_COLLECT" ? String(cost.participationFee) : "",
    feeIncludes: cost.type === "HOST_COLLECT" ? cost.feeIncludes ?? "" : "",
    paymentInfo: cost.type === "HOST_COLLECT" ? cost.paymentInfo ?? "" : "",
    paymentDeadline,
    cancellationPolicy: cost.type === "HOST_COLLECT" ? cost.cancellationPolicy ?? "" : "",
    description: program.description,
    bringItems: program.detail.bringItems ?? "",
    notice: program.detail.notice ?? "",
  };
}

export interface ValidationIssue {
  field: string;
  message: string;
}

export type ValidationResult<T> =
  | { success: true; data: T; issues: [] }
  | { success: false; data: null; issues: ValidationIssue[] };

const optionalText = (value: string): string | null => value.trim() || null;

function localDateTime(date: string, time: string): string | null {
  if (!date || !time) return null;
  const value = `${date}T${time}:00${OA_UTC_OFFSET}`;
  return Number.isNaN(Date.parse(value)) ? null : new Date(value).toISOString();
}

function optionalLocalDateTime(value: string): string | null {
  if (!value.trim()) return null;
  const withSeconds = value.length === 16 ? `${value}:00${OA_UTC_OFFSET}` : value;
  return Number.isNaN(Date.parse(withSeconds))
    ? null
    : new Date(withSeconds).toISOString();
}

function isHttpUrl(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function numberFrom(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function validateGatheringForm(
  values: GatheringFormValues,
): ValidationResult<CreateGatheringInput> {
  const issues: ValidationIssue[] = [];
  const title = values.title.trim();
  const description = values.description.trim();
  const location = values.place.trim();
  const startAt = localDateTime(values.date, values.startTime);
  const endAt = values.endTime
    ? localDateTime(values.date, values.endTime)
    : null;
  const capacity = numberFrom(values.capacity);

  if (!title) issues.push({ field: "title", message: "제목을 입력해 주세요." });
  if (!GATHERING_CATEGORIES.includes(values.category as GatheringCategory)) {
    issues.push({ field: "category", message: "카테고리를 선택해 주세요." });
  }
  if (!values.date) issues.push({ field: "date", message: "날짜를 선택해 주세요." });
  if (!values.startTime) {
    issues.push({ field: "startTime", message: "시작 시간을 입력해 주세요." });
  } else if (startAt === null) {
    issues.push({ field: "startTime", message: "유효한 시간을 입력해 주세요." });
  }
  if (values.endTime && endAt === null) {
    issues.push({ field: "endTime", message: "유효한 시간을 입력해 주세요." });
  }
  if (startAt && endAt && Date.parse(endAt) <= Date.parse(startAt)) {
    issues.push({ field: "endTime", message: "종료 시간은 시작 시간 이후여야 합니다." });
  }
  if (!location) issues.push({ field: "place", message: "장소를 입력해 주세요." });
  if (!isHttpUrl(values.mapUrl)) {
    issues.push({ field: "mapUrl", message: "유효한 지도 링크를 입력해 주세요." });
  }
  if (capacity === null || !Number.isInteger(capacity) || capacity < 1) {
    issues.push({ field: "capacity", message: "정원은 1명 이상의 정수여야 합니다." });
  }
  if (!description) {
    issues.push({ field: "description", message: "설명을 입력해 주세요." });
  }

  const recruitmentDeadline = optionalLocalDateTime(values.recruitmentDeadline);
  if (values.recruitmentDeadline && recruitmentDeadline === null) {
    issues.push({ field: "recruitmentDeadline", message: "유효한 마감 시간을 입력해 주세요." });
  }
  if (
    startAt &&
    recruitmentDeadline &&
    Date.parse(recruitmentDeadline) > Date.parse(startAt)
  ) {
    issues.push({ field: "recruitmentDeadline", message: "모집 마감은 시작 전이어야 합니다." });
  }

  let cost: CreateGatheringInput["cost"] = { type: "FREE" };
  if (values.costType === "INDIVIDUAL_PURCHASE") {
    const estimatedPrice = numberFrom(values.estimatedPrice);
    if (values.estimatedPrice && (estimatedPrice === null || estimatedPrice < 0)) {
      issues.push({ field: "estimatedPrice", message: "예상 가격을 확인해 주세요." });
    }
    if (!isHttpUrl(values.purchaseUrl)) {
      issues.push({ field: "purchaseUrl", message: "유효한 구매 링크를 입력해 주세요." });
    }
    cost = {
      type: "INDIVIDUAL_PURCHASE",
      estimatedPrice,
      purchaseUrl: optionalText(values.purchaseUrl),
      purchaseNote: optionalText(values.purchaseNote),
    };
  }
  if (values.costType === "HOST_COLLECT") {
    const participationFee = numberFrom(values.participationFee);
    const paymentDeadline = optionalLocalDateTime(values.paymentDeadline);
    if (participationFee === null || participationFee <= 0) {
      issues.push({ field: "participationFee", message: "참가비를 입력해 주세요." });
    }
    if (!values.paymentInfo.trim()) {
      issues.push({ field: "paymentInfo", message: "입금 정보를 입력해 주세요." });
    }
    if (values.paymentDeadline && paymentDeadline === null) {
      issues.push({ field: "paymentDeadline", message: "유효한 납부 마감을 입력해 주세요." });
    }
    if (
      startAt &&
      paymentDeadline &&
      Date.parse(paymentDeadline) > Date.parse(startAt)
    ) {
      issues.push({ field: "paymentDeadline", message: "납부 마감은 시작 전이어야 합니다." });
    }
    cost = {
      type: "HOST_COLLECT",
      participationFee: participationFee ?? 0,
      feeIncludes: optionalText(values.feeIncludes),
      paymentInfo: values.paymentInfo.trim(),
      paymentDeadline,
      cancellationPolicy: optionalText(values.cancellationPolicy),
    };
  }

  if (
    issues.length > 0 ||
    startAt === null ||
    capacity === null ||
    values.category === ""
  ) {
    return { success: false, data: null, issues };
  }

  return {
    success: true,
    issues: [],
    data: {
      title,
      category: values.category,
      description,
      startAt,
      endAt,
      location,
      meetingPoint: optionalText(values.meetingPoint),
      mapUrl: optionalText(values.mapUrl),
      capacity,
      recruitmentDeadline,
      waitlistEnabled: values.waitlistEnabled,
      cost,
      bringItems: optionalText(values.bringItems),
      notice: optionalText(values.notice),
    },
  };
}

export function validateCreateGatheringInput(
  input: CreateGatheringInput,
): ValidationResult<CreateGatheringInput> {
  const issues: ValidationIssue[] = [];
  if (!input.title.trim()) issues.push({ field: "title", message: "제목이 필요합니다." });
  if (!input.description.trim()) issues.push({ field: "description", message: "설명이 필요합니다." });
  if (!input.location.trim()) issues.push({ field: "place", message: "장소가 필요합니다." });
  const startTime = Date.parse(input.startAt);
  if (Number.isNaN(startTime)) {
    issues.push({ field: "startAt", message: "시작 시간이 유효하지 않습니다." });
  }
  if (input.endAt) {
    const endTime = Date.parse(input.endAt);
    if (Number.isNaN(endTime)) {
      issues.push({ field: "endAt", message: "종료 시간이 유효하지 않습니다." });
    } else if (!Number.isNaN(startTime) && endTime <= startTime) {
      issues.push({ field: "endAt", message: "종료 시간은 시작 시간 이후여야 합니다." });
    }
  }
  if (!GATHERING_CATEGORIES.includes(input.category)) {
    issues.push({ field: "category", message: "카테고리가 유효하지 않습니다." });
  }
  if (input.mapUrl && !isHttpUrl(input.mapUrl)) {
    issues.push({ field: "mapUrl", message: "지도 링크가 유효하지 않습니다." });
  }
  if (!Number.isInteger(input.capacity) || input.capacity < 1) {
    issues.push({ field: "capacity", message: "정원이 유효하지 않습니다." });
  }
  if (input.recruitmentDeadline) {
    const deadline = Date.parse(input.recruitmentDeadline);
    if (Number.isNaN(deadline)) {
      issues.push({ field: "recruitmentDeadline", message: "모집 마감이 유효하지 않습니다." });
    } else if (!Number.isNaN(startTime) && deadline > startTime) {
      issues.push({ field: "recruitmentDeadline", message: "모집 마감은 시작 전이어야 합니다." });
    }
  }
  if (!GATHERING_COST_TYPES.includes(input.cost.type)) {
    issues.push({ field: "costType", message: "비용 방식이 유효하지 않습니다." });
  }
  if (input.cost.type === "INDIVIDUAL_PURCHASE") {
    if (input.cost.estimatedPrice !== null && input.cost.estimatedPrice < 0) {
      issues.push({ field: "estimatedPrice", message: "예상 가격이 유효하지 않습니다." });
    }
    if (input.cost.purchaseUrl && !isHttpUrl(input.cost.purchaseUrl)) {
      issues.push({ field: "purchaseUrl", message: "구매 링크가 유효하지 않습니다." });
    }
  }
  if (input.cost.type === "HOST_COLLECT") {
    if (input.cost.participationFee <= 0) {
      issues.push({ field: "participationFee", message: "참가비가 유효하지 않습니다." });
    }
    if (!input.cost.paymentInfo.trim()) {
      issues.push({ field: "paymentInfo", message: "입금 정보가 필요합니다." });
    }
    if (input.cost.paymentDeadline) {
      const paymentDeadline = Date.parse(input.cost.paymentDeadline);
      if (Number.isNaN(paymentDeadline)) {
        issues.push({ field: "paymentDeadline", message: "납부 마감이 유효하지 않습니다." });
      } else if (!Number.isNaN(startTime) && paymentDeadline > startTime) {
        issues.push({ field: "paymentDeadline", message: "납부 마감은 시작 전이어야 합니다." });
      }
    }
  }
  return issues.length
    ? { success: false, data: null, issues }
    : { success: true, data: input, issues: [] };
}
