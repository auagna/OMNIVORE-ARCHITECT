import {
  GATHERING_CATEGORIES,
  PAGE_CONTENT_KEYS,
  PROGRAM_STATUSES,
} from "@/constants";
import type {
  ActivityMetadataValue,
  GatheringCost,
  GatheringProgram,
  GatheringProgramRevision,
  HostParticipant,
  MemberDirectoryEntry,
  PageContent,
  Participation,
  Program,
  ProgramActivity,
  ProgramApproval,
  ProgramMessage,
  ProgramRecord,
  ProgramRecordSnapshot,
  ReadingProgram,
  RecordMaterial,
  TalkProgram,
  User,
} from "@/types";
import type {
  ActiveMemberDirectoryRow,
  GatheringDetailRow,
  GatheringPaymentInstructionRow,
  HostParticipantReadRow,
  Json,
  PageContentRow,
  ParticipationRow,
  ProgramActivityRow,
  ProgramApprovalRow,
  ProgramParticipantCountsRow,
  ProgramMessageRow,
  ProgramRevisionRow,
  ProgramRow,
  ReadingDetailRow,
  RecordMaterialRow,
  RecordRow,
  TalkDetailRow,
  SafeMemberRow,
  UserRow,
} from "@/types/database";

export interface ActiveMemberDirectoryEntry extends MemberDirectoryEntry {
  participatingSeasons: string[];
}

export class DatabaseMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseMappingError";
  }
}

const mappingError = (message: string): never => {
  throw new DatabaseMappingError(message);
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function objectValue(value: unknown, path: string): Record<string, unknown> {
  return isObject(value) ? value : mappingError(`${path} must be an object.`);
}

function stringValue(
  object: Record<string, unknown>,
  key: string,
  path: string,
): string {
  const value = object[key];
  return typeof value === "string"
    ? value
    : mappingError(`${path}.${key} must be a string.`);
}

function nullableStringValue(
  object: Record<string, unknown>,
  key: string,
  path: string,
): string | null {
  const value = object[key];
  return value === null || typeof value === "string"
    ? value
    : mappingError(`${path}.${key} must be a string or null.`);
}

function numberValue(
  object: Record<string, unknown>,
  key: string,
  path: string,
): number {
  const value = object[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : mappingError(`${path}.${key} must be a finite number.`);
}

function nullableNumberValue(
  object: Record<string, unknown>,
  key: string,
  path: string,
): number | null {
  const value = object[key];
  return value === null
    ? null
    : typeof value === "number" && Number.isFinite(value)
      ? value
      : mappingError(`${path}.${key} must be a finite number or null.`);
}

function booleanValue(
  object: Record<string, unknown>,
  key: string,
  path: string,
): boolean {
  const value = object[key];
  return typeof value === "boolean"
    ? value
    : mappingError(`${path}.${key} must be a boolean.`);
}

function oneOfValue<T extends string>(
  object: Record<string, unknown>,
  key: string,
  values: readonly T[],
  path: string,
): T {
  const value = stringValue(object, key, path);
  const matched = values.find((candidate) => candidate === value);
  return matched ?? mappingError(`${path}.${key} has an unsupported value.`);
}

function activityMetadataValue(value: Json | undefined): ActivityMetadataValue {
  if (value === undefined) mappingError("Activity metadata cannot contain undefined.");
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map(activityMetadataValue);

  const object = isObject(value)
    ? value
    : mappingError("Activity metadata must contain JSON values only.");
  const mapped: Record<string, ActivityMetadataValue> = {};
  for (const [key, nested] of Object.entries(object)) {
    mapped[key] = activityMetadataValue(nested as Json | undefined);
  }
  return mapped;
}

export function mapUserRow(
  row: UserRow,
  imageUrl: string | null = null,
): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    imageUrl,
    occupation: row.occupation,
    bio: row.bio,
    interests: [...row.interests],
    status: row.status,
    createdAt: row.created_at,
  };
}

export function mapSafeMemberRow(
  row: SafeMemberRow,
  imageUrl: string | null = null,
): MemberDirectoryEntry {
  return {
    id: row.id,
    name: row.name,
    imageUrl,
    occupation: row.occupation,
    bio: row.bio,
    interests: [...row.interests],
  };
}

export function mapActiveMemberDirectoryRow(
  row: ActiveMemberDirectoryRow,
  imageUrl: string | null = null,
): ActiveMemberDirectoryEntry {
  return {
    ...mapSafeMemberRow(row, imageUrl),
    participatingSeasons: [...row.participating_seasons],
  };
}

export function mapProgramParticipantCountsRow(
  row: ProgramParticipantCountsRow,
): Pick<import("@/types").ParticipantCounts, "confirmed" | "waitlist"> {
  return {
    confirmed: row.confirmed_count,
    waitlist: row.waitlist_count,
  };
}

export function mapHostParticipantReadRow(
  row: HostParticipantReadRow,
  programId: string,
  imageUrl: string | null = null,
): HostParticipant {
  return {
    participation: {
      id: row.participation_id,
      programId,
      userId: row.id,
      status: row.participation_status,
      paymentStatus: row.payment_status,
      joinedAt: row.joined_at,
    },
    user: mapSafeMemberRow(row, imageUrl),
  };
}

export function mapParticipationRow(row: ParticipationRow): Participation {
  return {
    id: row.id,
    programId: row.program_id,
    userId: row.user_id,
    status: row.status,
    paymentStatus: row.payment_status,
    joinedAt: row.joined_at,
  };
}

export type ProgramDetailRowSet =
  | {
      kind: "GATHERING";
      detail: GatheringDetailRow;
      paymentInstruction?: GatheringPaymentInstructionRow | null;
    }
  | { kind: "TALK"; detail: TalkDetailRow }
  | { kind: "READING"; detail: ReadingDetailRow };

function assertMatchingProgramId(programId: string, detailProgramId: string): void {
  if (programId !== detailProgramId) {
    mappingError("Program and detail rows do not share the same id.");
  }
}

function gatheringCost(
  detail: GatheringDetailRow,
  paymentInstruction: GatheringPaymentInstructionRow | null | undefined,
): GatheringCost {
  if (detail.cost_type === "FREE") return { type: "FREE" };
  if (detail.cost_type === "INDIVIDUAL_PURCHASE") {
    return {
      type: "INDIVIDUAL_PURCHASE",
      estimatedPrice: detail.estimated_price,
      purchaseUrl: detail.purchase_url,
      purchaseNote: detail.purchase_note,
    };
  }
  if (detail.participation_fee === null) {
    return mappingError("HOST_COLLECT requires participation_fee.");
  }
  if (paymentInstruction && paymentInstruction.program_id !== detail.program_id) {
    return mappingError("Payment instructions belong to another Program.");
  }
  return {
    type: "HOST_COLLECT",
    participationFee: detail.participation_fee,
    feeIncludes: detail.fee_includes,
    paymentInfo: paymentInstruction?.payment_info ?? null,
    paymentDeadline: detail.payment_deadline,
    cancellationPolicy: detail.cancellation_policy,
  };
}

function programBase(row: ProgramRow) {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    hostId: row.host_id,
    startAt: row.start_at,
    endAt: row.end_at,
    location: row.location,
    mapUrl: row.map_url,
    capacity: row.capacity,
    status: row.status,
    coverImageId: row.cover_image_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapProgramRow(
  row: ProgramRow,
  detailRows: ProgramDetailRowSet,
): Program {
  if (row.type !== detailRows.kind) {
    return mappingError("Program type and detail kind do not match.");
  }
  assertMatchingProgramId(row.id, detailRows.detail.program_id);
  const base = programBase(row);

  if (detailRows.kind === "GATHERING") {
    const result: GatheringProgram = {
      ...base,
      type: "GATHERING",
      detail: {
        programId: detailRows.detail.program_id,
        category: detailRows.detail.category,
        meetingPoint: detailRows.detail.meeting_point,
        recruitmentDeadline: detailRows.detail.recruitment_deadline,
        waitlistEnabled: detailRows.detail.waitlist_enabled,
        cost: gatheringCost(detailRows.detail, detailRows.paymentInstruction),
        bringItems: detailRows.detail.bring_items,
        notice: detailRows.detail.notice,
      },
    };
    return result;
  }

  if (detailRows.kind === "TALK") {
    const result: TalkProgram = {
      ...base,
      type: "TALK",
      detail: {
        programId: detailRows.detail.program_id,
        origin: detailRows.detail.origin,
        subtitle: detailRows.detail.subtitle,
        speakerName: detailRows.detail.speaker_name,
        speakerAffiliation: detailRows.detail.speaker_affiliation,
        speakerBio: detailRows.detail.speaker_bio,
        organizer: detailRows.detail.organizer,
        address: detailRows.detail.address,
        sourceUrl: detailRows.detail.source_url,
        registrationType: detailRows.detail.registration_type,
        registrationUrl: detailRows.detail.registration_url,
      },
    };
    return result;
  }

  const result: ReadingProgram = {
    ...base,
    type: "READING",
    detail: {
      programId: detailRows.detail.program_id,
      resourceTitle: detailRows.detail.resource_title,
    },
  };
  return result;
}

export function mapProgramMessageRow(row: ProgramMessageRow): ProgramMessage {
  return {
    id: row.id,
    programId: row.program_id,
    authorId: row.author_id,
    type: row.type,
    content: row.content,
    parentId: row.parent_id,
    isPinned: row.is_pinned,
    isHidden: row.is_hidden,
    createdAt: row.created_at,
    editedAt: row.edited_at,
  };
}

export function mapProgramApprovalRow(row: ProgramApprovalRow): ProgramApproval {
  return {
    id: row.id,
    programId: row.program_id,
    requesterId: row.requester_id,
    reviewerId: row.reviewer_id,
    status: row.status,
    requestedAt: row.requested_at,
    reviewedAt: row.reviewed_at,
    reviewComment: row.review_comment,
    publishedAt: row.published_at,
  };
}

export function mapRecordMaterialRow(row: RecordMaterialRow): RecordMaterial {
  return {
    id: row.id,
    recordId: row.record_id,
    type: row.type,
    mediaId: row.media_id,
    url: row.url,
    label: row.label,
    createdAt: row.created_at,
  };
}

export function mapProgramRecordRow(
  row: RecordRow,
  materialRows: readonly RecordMaterialRow[] = [],
): ProgramRecord {
  const ordered = [...materialRows].sort(
    (left, right) => left.position - right.position,
  );
  const photo = ordered.find((material) => material.type === "PHOTO");
  const link = ordered.find((material) => material.type === "LINK");
  return {
    id: row.id,
    programId: row.program_id,
    authorId: row.author_id,
    what: row.what,
    found: row.found,
    summary: row.what,
    body: row.found,
    photoMediaId: photo?.media_id ?? null,
    linkUrl: link?.url ?? null,
    createdAt: row.created_at,
  };
}

export function mapProgramRecordSnapshot(
  row: RecordRow,
  materialRows: readonly RecordMaterialRow[],
): ProgramRecordSnapshot {
  const ordered = [...materialRows].sort(
    (left, right) => left.position - right.position,
  );
  return {
    record: mapProgramRecordRow(row, ordered),
    materials: ordered.map(mapRecordMaterialRow),
  };
}

export function mapPageContentRow(row: PageContentRow): PageContent {
  const key = PAGE_CONTENT_KEYS.find((candidate) => candidate === row.key);
  if (!key) return mappingError(`Unsupported PageContent key: ${row.key}`);
  return {
    id: row.id,
    key,
    title: row.title,
    headline: row.headline,
    description: row.description,
    emptyState: row.empty_state,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

export function mapProgramActivityRow(row: ProgramActivityRow): ProgramActivity {
  if (row.actor_id === null) {
    return mappingError("ProgramActivity actor_id cannot map to the current domain.");
  }
  const metadata = activityMetadataValue(row.metadata ?? {});
  if (!isObject(metadata)) {
    return mappingError("ProgramActivity metadata must be an object.");
  }
  return {
    id: row.id,
    programId: row.program_id,
    actorId: row.actor_id,
    type: row.type,
    metadata,
    dedupeKey: row.dedupe_key ?? row.id,
    createdAt: row.created_at,
  };
}

export function parseGatheringRevisionSnapshot(value: Json): GatheringProgram {
  const root = objectValue(value, "revision");
  const type = stringValue(root, "type", "revision");
  if (type !== "GATHERING") {
    return mappingError("Revision snapshot must contain a GATHERING Program.");
  }
  const detail = objectValue(root.detail, "revision.detail");
  const costObject = objectValue(detail.cost, "revision.detail.cost");
  const costType = stringValue(costObject, "type", "revision.detail.cost");
  let cost: GatheringCost;

  if (costType === "FREE") {
    cost = { type: "FREE" };
  } else if (costType === "INDIVIDUAL_PURCHASE") {
    cost = {
      type: "INDIVIDUAL_PURCHASE",
      estimatedPrice: nullableNumberValue(
        costObject,
        "estimatedPrice",
        "revision.detail.cost",
      ),
      purchaseUrl: nullableStringValue(
        costObject,
        "purchaseUrl",
        "revision.detail.cost",
      ),
      purchaseNote: nullableStringValue(
        costObject,
        "purchaseNote",
        "revision.detail.cost",
      ),
    };
  } else if (costType === "HOST_COLLECT") {
    cost = {
      type: "HOST_COLLECT",
      participationFee: numberValue(
        costObject,
        "participationFee",
        "revision.detail.cost",
      ),
      feeIncludes: nullableStringValue(
        costObject,
        "feeIncludes",
        "revision.detail.cost",
      ),
      paymentInfo: stringValue(
        costObject,
        "paymentInfo",
        "revision.detail.cost",
      ),
      paymentDeadline: nullableStringValue(
        costObject,
        "paymentDeadline",
        "revision.detail.cost",
      ),
      cancellationPolicy: nullableStringValue(
        costObject,
        "cancellationPolicy",
        "revision.detail.cost",
      ),
    };
  } else {
    return mappingError("Revision snapshot has an unsupported cost type.");
  }

  return {
    id: stringValue(root, "id", "revision"),
    code: stringValue(root, "code", "revision"),
    type: "GATHERING",
    title: stringValue(root, "title", "revision"),
    description: stringValue(root, "description", "revision"),
    hostId: stringValue(root, "hostId", "revision"),
    startAt: stringValue(root, "startAt", "revision"),
    endAt: nullableStringValue(root, "endAt", "revision"),
    location: stringValue(root, "location", "revision"),
    mapUrl: nullableStringValue(root, "mapUrl", "revision"),
    capacity: numberValue(root, "capacity", "revision"),
    status: oneOfValue(root, "status", PROGRAM_STATUSES, "revision"),
    coverImageId: nullableStringValue(root, "coverImageId", "revision"),
    createdAt: stringValue(root, "createdAt", "revision"),
    updatedAt: stringValue(root, "updatedAt", "revision"),
    detail: {
      programId: stringValue(detail, "programId", "revision.detail"),
      category: oneOfValue(
        detail,
        "category",
        GATHERING_CATEGORIES,
        "revision.detail",
      ),
      meetingPoint: nullableStringValue(
        detail,
        "meetingPoint",
        "revision.detail",
      ),
      recruitmentDeadline: nullableStringValue(
        detail,
        "recruitmentDeadline",
        "revision.detail",
      ),
      waitlistEnabled: booleanValue(
        detail,
        "waitlistEnabled",
        "revision.detail",
      ),
      cost,
      bringItems: nullableStringValue(detail, "bringItems", "revision.detail"),
      notice: nullableStringValue(detail, "notice", "revision.detail"),
    },
  };
}

export function mapProgramRevisionRow(
  row: ProgramRevisionRow,
): GatheringProgramRevision {
  const proposedProgram = parseGatheringRevisionSnapshot(row.proposed_snapshot);
  if (
    proposedProgram.id !== row.program_id ||
    proposedProgram.detail.programId !== row.program_id
  ) {
    return mappingError("Revision snapshot program id does not match its row.");
  }
  return {
    id: row.id,
    programId: row.program_id,
    approvalId: row.approval_id,
    proposedBy: row.proposed_by,
    proposedProgram,
    changedFields: [...row.changed_fields],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
