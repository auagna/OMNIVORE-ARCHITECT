import type {
  CreateGatheringInput,
  GatheringProgram,
  Participation,
  Program,
  ProgramApproval,
  ProgramTab,
  User,
} from "../../../types";

const ACTIVE_PROGRAM_TABS = ["INFO", "TALK", "PEOPLE"] as const satisfies readonly ProgramTab[];
const COMPLETED_PROGRAM_TABS = ["INFO", "RECORD", "TALK"] as const satisfies readonly ProgramTab[];

export const MATERIAL_GATHERING_CHANGE_FIELDS = [
  "startAt",
  "endAt",
  "location",
  "costType",
  "participationFee",
  "paymentInfo",
  "cancellationPolicy",
] as const;

export const OPERATIONAL_GATHERING_CHANGE_FIELDS = [
  "title",
  "category",
  "description",
  "meetingPoint",
  "mapUrl",
  "capacity",
  "recruitmentDeadline",
  "waitlistEnabled",
  "estimatedPrice",
  "purchaseUrl",
  "purchaseNote",
  "feeIncludes",
  "paymentDeadline",
  "bringItems",
  "notice",
] as const;

export type MaterialGatheringChangeField =
  (typeof MATERIAL_GATHERING_CHANGE_FIELDS)[number];
export type OperationalGatheringChangeField =
  (typeof OPERATIONAL_GATHERING_CHANGE_FIELDS)[number];
export type GatheringChangeField =
  | MaterialGatheringChangeField
  | OperationalGatheringChangeField;
export type GatheringChangeClassification = "NONE" | "OPERATIONAL" | "MATERIAL";

export interface GatheringChangePolicy {
  classification: GatheringChangeClassification;
  changedFields: GatheringChangeField[];
  materialFields: MaterialGatheringChangeField[];
  operationalFields: OperationalGatheringChangeField[];
  requiresReapproval: boolean;
}

export function getProgramDetailTabs(program: Program): readonly ProgramTab[] {
  return program.status === "COMPLETED"
    ? COMPLETED_PROGRAM_TABS
    : ACTIVE_PROGRAM_TABS;
}

const normalizeOptionalText = (value: string | null): string | null =>
  value?.trim() || null;

const sameOptionalText = (left: string | null, right: string | null): boolean =>
  normalizeOptionalText(left) === normalizeOptionalText(right);

function pushIfChanged<TField extends GatheringChangeField>(
  target: TField[],
  field: TField,
  changed: boolean,
): void {
  if (changed) target.push(field);
}

/**
 * Classifies an approved Gathering edit using the v3.1 council policy.
 * Material changes are intentionally narrow; every other editable field is
 * operational and can be applied without resetting approval.
 */
export function classifyGatheringChanges(
  existing: GatheringProgram,
  input: CreateGatheringInput,
): GatheringChangePolicy {
  const materialFields: MaterialGatheringChangeField[] = [];
  const operationalFields: OperationalGatheringChangeField[] = [];

  pushIfChanged(materialFields, "startAt", existing.startAt !== input.startAt);
  pushIfChanged(materialFields, "endAt", existing.endAt !== input.endAt);
  pushIfChanged(
    materialFields,
    "location",
    existing.location.trim() !== input.location.trim(),
  );
  pushIfChanged(
    materialFields,
    "costType",
    existing.detail.cost.type !== input.cost.type,
  );

  pushIfChanged(operationalFields, "title", existing.title.trim() !== input.title.trim());
  pushIfChanged(
    operationalFields,
    "category",
    existing.detail.category !== input.category,
  );
  pushIfChanged(
    operationalFields,
    "description",
    existing.description.trim() !== input.description.trim(),
  );
  pushIfChanged(
    operationalFields,
    "meetingPoint",
    !sameOptionalText(existing.detail.meetingPoint, input.meetingPoint),
  );
  pushIfChanged(
    operationalFields,
    "mapUrl",
    !sameOptionalText(existing.mapUrl, input.mapUrl),
  );
  pushIfChanged(
    operationalFields,
    "capacity",
    existing.capacity !== input.capacity,
  );
  pushIfChanged(
    operationalFields,
    "recruitmentDeadline",
    existing.detail.recruitmentDeadline !== input.recruitmentDeadline,
  );
  pushIfChanged(
    operationalFields,
    "waitlistEnabled",
    existing.detail.waitlistEnabled !== input.waitlistEnabled,
  );
  pushIfChanged(
    operationalFields,
    "bringItems",
    !sameOptionalText(existing.detail.bringItems, input.bringItems),
  );
  pushIfChanged(
    operationalFields,
    "notice",
    !sameOptionalText(existing.detail.notice, input.notice),
  );

  const existingCost = existing.detail.cost;
  const nextCost = input.cost;
  if (existingCost.type === "INDIVIDUAL_PURCHASE" && nextCost.type === "INDIVIDUAL_PURCHASE") {
    pushIfChanged(
      operationalFields,
      "estimatedPrice",
      existingCost.estimatedPrice !== nextCost.estimatedPrice,
    );
    pushIfChanged(
      operationalFields,
      "purchaseUrl",
      !sameOptionalText(existingCost.purchaseUrl, nextCost.purchaseUrl),
    );
    pushIfChanged(
      operationalFields,
      "purchaseNote",
      !sameOptionalText(existingCost.purchaseNote, nextCost.purchaseNote),
    );
  }
  if (existingCost.type === "HOST_COLLECT" && nextCost.type === "HOST_COLLECT") {
    pushIfChanged(
      materialFields,
      "participationFee",
      existingCost.participationFee !== nextCost.participationFee,
    );
    pushIfChanged(
      materialFields,
      "paymentInfo",
      (existingCost.paymentInfo ?? "").trim() !== nextCost.paymentInfo.trim(),
    );
    pushIfChanged(
      materialFields,
      "cancellationPolicy",
      !sameOptionalText(existingCost.cancellationPolicy, nextCost.cancellationPolicy),
    );
    pushIfChanged(
      operationalFields,
      "feeIncludes",
      !sameOptionalText(existingCost.feeIncludes, nextCost.feeIncludes),
    );
    pushIfChanged(
      operationalFields,
      "paymentDeadline",
      existingCost.paymentDeadline !== nextCost.paymentDeadline,
    );
  }

  const changedFields: GatheringChangeField[] = [
    ...materialFields,
    ...operationalFields,
  ];
  const classification: GatheringChangeClassification = materialFields.length
    ? "MATERIAL"
    : operationalFields.length
      ? "OPERATIONAL"
      : "NONE";

  return {
    classification,
    changedFields,
    materialFields,
    operationalFields,
    requiresReapproval: classification === "MATERIAL",
  };
}

export function hasMaterialGatheringChanges(
  existing: GatheringProgram,
  input: CreateGatheringInput,
): boolean {
  return classifyGatheringChanges(existing, input).requiresReapproval;
}

export function isActiveProgramUser(user: User | null): user is User {
  return user !== null && (user.status === "MEMBER" || user.status === "ADMIN");
}

export function isProgramHost(user: User | null, program: Program): boolean {
  return user !== null && user.id === program.hostId;
}

export function isProgramAdmin(user: User | null): boolean {
  return user?.status === "ADMIN";
}

export function isMatchingParticipation(
  user: User | null,
  program: Program,
  participation: Participation | null,
): participation is Participation {
  return (
    isActiveProgramUser(user) &&
    participation !== null &&
    participation.userId === user.id &&
    participation.programId === program.id
  );
}

export function approvalAllowsPublishedOperation(
  approval: ProgramApproval | null,
): boolean {
  return (
    approval === null ||
    approval.publishedAt != null ||
    approval.status === "NOT_REQUIRED" ||
    approval.status === "APPROVED"
  );
}

export function canViewProgramByPolicy(
  user: User | null,
  program: Program,
  approval: ProgramApproval | null,
): boolean {
  if (program.status !== "DRAFT") return true;
  if (!isActiveProgramUser(user)) return false;
  return (
    isProgramAdmin(user) ||
    isProgramHost(user, program) ||
    approval?.requesterId === user.id
  );
}
