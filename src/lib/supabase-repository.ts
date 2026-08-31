import type {
  RealtimeChannel,
  SupabaseClient,
} from "@supabase/supabase-js";

import {
  buildProgramSnapshot,
  getParticipantCounts,
  getProgramDisplayStatus,
  selectCalendarPrograms,
  selectHomeData,
  selectHostedPrograms,
  selectMyUpcoming,
  selectPrograms,
} from "../features/programs/model";
import {
  isMessageReactionEmoji,
  type MessageReactionChangeListener,
  type MessageReactionEmoji,
  type MessageReactionSnapshot,
} from "../features/conversation/reactions";
import type {
  AdminMemberRegistration,
  ApprovalStatus,
  ActivityMetadataValue,
  CalendarScope,
  CreateGatheringInput,
  CreateProgramMessageInput,
  CreateRecordInput,
  GatheringCost,
  GatheringProgram,
  GatheringProgramRevision,
  HomeAction,
  HomeData,
  HostDashboard,
  ISODateTime,
  JoinOutcome,
  MemberDirectoryEntry,
  PageContent,
  PageContentKey,
  Participation,
  Program,
  ProgramActivity,
  ProgramApproval,
  ProgramApprovalDecision,
  ProgramApprovalSnapshot,
  ProgramFilter,
  ProgramMessage,
  ParticipantCounts,
  ProgramRecord,
  ProgramRecordSnapshot,
  ProgramSnapshot,
  ProgramStatus,
  RecordMaterial,
  UpdatePageContentInput,
  User,
} from "../types";
import type {
  AdminMemberRegistrationRow,
  Database,
  GatheringDetailRow,
  GatheringPaymentInstructionRow,
  Json,
  PageContentRow,
  ParticipationRow,
  ProgramActivityRow,
  ProgramApprovalRow,
  ProgramMessageRow,
  MessageReactionReadRow,
  ProgramRevisionRow,
  ProgramRow,
  ReadingDetailRow,
  RecordMaterialRow,
  RecordRow,
  TalkDetailRow,
  UserRow,
} from "../types/database";
import {
  RepositoryError,
  type OARepository,
  type RepositorySnapshot,
} from "./repositories/contracts";
import {
  mapHostParticipantReadRow,
  mapSafeMemberRow,
} from "./supabase-mappers";

type Listener = () => void;

interface TalkSubscription {
  channel: RealtimeChannel | null;
  references: number;
  reactionListeners: Set<MessageReactionChangeListener>;
  cancelled: boolean;
}

export type SupabaseRepositoryFailureCode =
  | "QUERY_FAILED"
  | "INVALID_SERVER_DATA";

/**
 * Transport/configuration failures that are not normal domain outcomes.
 * Expected authorization and lifecycle failures are mapped to RepositoryError.
 */
export class SupabaseRepositoryError extends Error {
  constructor(
    public readonly code: SupabaseRepositoryFailureCode,
    public readonly operation: string,
    message: string,
    public readonly causeCode: string | null = null,
  ) {
    super(message);
    this.name = "SupabaseRepositoryError";
  }
}

interface SupabaseFailure {
  code?: string;
  message: string;
  details?: string;
  hint?: string;
}

interface VisibleModel {
  programs: Program[];
  users: MemberDirectoryEntry[];
  participations: Participation[];
  records: ProgramRecord[];
  participantCounts: Map<
    string,
    Pick<ParticipantCounts, "confirmed" | "waitlist">
  >;
}

const EMPTY_SNAPSHOT: Readonly<RepositorySnapshot> = Object.freeze({
  revision: 0,
});

function asObject(value: Json): Record<string, Json | undefined> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : null;
}

function requiredString(
  value: Json | undefined,
  operation: string,
  field: string,
): string {
  if (typeof value !== "string") {
    throw new SupabaseRepositoryError(
      "INVALID_SERVER_DATA",
      operation,
      `Supabase returned an invalid ${field}.`,
    );
  }
  return value;
}

function nullableString(value: Json | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function nullableNumber(value: Json | undefined): number | null {
  return typeof value === "number" ? value : null;
}

function mapCostFromRow(
  row: GatheringDetailRow,
  paymentInstruction: GatheringPaymentInstructionRow | null,
): GatheringCost {
  if (row.cost_type === "FREE") return { type: "FREE" };
  if (row.cost_type === "INDIVIDUAL_PURCHASE") {
    return {
      type: "INDIVIDUAL_PURCHASE",
      estimatedPrice: row.estimated_price,
      purchaseUrl: row.purchase_url,
      purchaseNote: row.purchase_note,
    };
  }
  return {
    type: "HOST_COLLECT",
    participationFee: row.participation_fee ?? 0,
    feeIncludes: row.fee_includes,
    // Persisted/read data stays distinct from presentation copy. RLS can
    // deliberately withhold this value from an otherwise visible Program.
    paymentInfo: paymentInstruction?.payment_info ?? null,
    paymentDeadline: row.payment_deadline,
    cancellationPolicy: row.cancellation_policy,
  };
}

function mapProgramRow(
  row: ProgramRow,
  gathering: GatheringDetailRow | null,
  talk: TalkDetailRow | null,
  reading: ReadingDetailRow | null,
  paymentInstruction: GatheringPaymentInstructionRow | null,
): Program {
  const base = {
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

  if (row.type === "GATHERING" && gathering) {
    return {
      ...base,
      type: "GATHERING",
      detail: {
        programId: row.id,
        category: gathering.category,
        meetingPoint: gathering.meeting_point,
        recruitmentDeadline: gathering.recruitment_deadline,
        waitlistEnabled: gathering.waitlist_enabled,
        cost: mapCostFromRow(gathering, paymentInstruction),
        bringItems: gathering.bring_items,
        notice: gathering.notice,
      },
    };
  }

  if (row.type === "TALK" && talk) {
    return {
      ...base,
      type: "TALK",
      detail: {
        programId: row.id,
        origin: talk.origin,
        subtitle: talk.subtitle,
        speakerName: talk.speaker_name,
        speakerAffiliation: talk.speaker_affiliation,
        speakerBio: talk.speaker_bio,
        organizer: talk.organizer,
        address: talk.address,
        sourceUrl: talk.source_url,
        registrationType: talk.registration_type,
        registrationUrl: talk.registration_url,
      },
    };
  }

  if (row.type === "READING" && reading) {
    return {
      ...base,
      type: "READING",
      detail: {
        programId: row.id,
        resourceTitle: reading.resource_title,
      },
    };
  }

  throw new SupabaseRepositoryError(
    "INVALID_SERVER_DATA",
    "mapProgramRow",
    `Program ${row.id} is missing its ${row.type} detail row.`,
  );
}

function mapUserRow(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    // Media URL resolution belongs to the Media repository/pipeline. Never
    // synthesize a storage URL from a potentially private bucket here.
    imageUrl: null,
    occupation: row.occupation,
    bio: row.bio,
    interests: row.interests,
    status: row.status,
    createdAt: row.created_at,
  };
}

function mapAdminMemberRegistrationRow(
  row: AdminMemberRegistrationRow,
): AdminMemberRegistration {
  return {
    user: mapUserRow(row),
    participatingSeasons: [...row.participating_seasons],
  };
}

function mapParticipationRow(row: ParticipationRow): Participation {
  return {
    id: row.id,
    programId: row.program_id,
    userId: row.user_id,
    status: row.status,
    paymentStatus: row.payment_status,
    joinedAt: row.joined_at,
  };
}

function mapRecordMaterialRow(row: RecordMaterialRow): RecordMaterial {
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

function mapRecordRow(
  row: RecordRow,
  materials: readonly RecordMaterial[] = [],
): ProgramRecord {
  const photo = materials.find((item) => item.type === "PHOTO") ?? null;
  const link = materials.find((item) => item.type === "LINK") ?? null;
  return {
    id: row.id,
    programId: row.program_id,
    authorId: row.author_id,
    what: row.what,
    found: row.found,
    summary: row.what,
    body: row.found,
    photoMediaId: photo?.mediaId ?? null,
    linkUrl: link?.url ?? null,
    createdAt: row.created_at,
  };
}

function mapApprovalRow(row: ProgramApprovalRow): ProgramApproval {
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

function mapMessageRow(row: ProgramMessageRow): ProgramMessage {
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

function mapMessageReactionRow(
  row: MessageReactionReadRow,
): MessageReactionSnapshot {
  if (!isMessageReactionEmoji(row.emoji)) {
    throw new SupabaseRepositoryError(
      "INVALID_SERVER_DATA",
      "mapMessageReactionRow",
      "Supabase returned an unsupported reaction emoji.",
    );
  }
  return {
    id: row.id,
    programId: row.program_id,
    messageId: row.message_id,
    userId: row.user_id,
    emoji: row.emoji,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    user: {
      id: row.user_id,
      name: row.user_name,
      imageUrl: null,
      seasons: [...row.participating_seasons],
    },
  };
}

function findReactionMessageId(value: unknown, depth = 0): string | null {
  if (depth > 4 || typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.message_id === "string") return record.message_id;
  for (const key of ["payload", "record", "old_record", "new", "old"]) {
    const nested = findReactionMessageId(record[key], depth + 1);
    if (nested) return nested;
  }
  return null;
}

function mapPageContentRow(row: PageContentRow): PageContent {
  return {
    id: row.id,
    key: row.key as PageContentKey,
    title: row.title,
    headline: row.headline,
    description: row.description,
    emptyState: row.empty_state,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

function mapActivityMetadataValue(value: Json): ActivityMetadataValue {
  if (Array.isArray(value)) return value.map(mapActivityMetadataValue);
  if (typeof value === "object" && value !== null) {
    const mapped: Record<string, ActivityMetadataValue> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (nested !== undefined) mapped[key] = mapActivityMetadataValue(nested);
    }
    return mapped;
  }
  return value;
}

function mapActivityRow(row: ProgramActivityRow): ProgramActivity {
  const metadata = asObject(row.metadata);
  const mappedMetadata: Record<string, ActivityMetadataValue> = {};
  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (value !== undefined) mappedMetadata[key] = mapActivityMetadataValue(value);
  }
  return {
    id: row.id,
    programId: row.program_id,
    actorId: row.actor_id ?? "deleted-user",
    type: row.type,
    metadata: mappedMetadata,
    dedupeKey: row.dedupe_key ?? row.id,
    createdAt: row.created_at,
  };
}

function parseRevisionCost(value: Json | undefined): GatheringCost {
  const operation = "parseRevisionSnapshot";
  const cost = value === undefined ? null : asObject(value);
  const type = cost?.type;
  if (type === "FREE") return { type };
  if (!cost) {
    throw new SupabaseRepositoryError(
      "INVALID_SERVER_DATA",
      operation,
      "Revision has no cost payload.",
    );
  }
  if (type === "INDIVIDUAL_PURCHASE") {
    return {
      type,
      estimatedPrice: nullableNumber(cost.estimatedPrice),
      purchaseUrl: nullableString(cost.purchaseUrl),
      purchaseNote: nullableString(cost.purchaseNote),
    };
  }
  if (type === "HOST_COLLECT") {
    const participationFee = cost.participationFee;
    if (typeof participationFee !== "number") {
      throw new SupabaseRepositoryError(
        "INVALID_SERVER_DATA",
        operation,
        "Revision HOST_COLLECT cost is missing participationFee.",
      );
    }
    return {
      type,
      participationFee,
      feeIncludes: nullableString(cost.feeIncludes),
      paymentInfo: requiredString(cost.paymentInfo, operation, "paymentInfo"),
      paymentDeadline: nullableString(cost.paymentDeadline),
      cancellationPolicy: nullableString(cost.cancellationPolicy),
    };
  }
  throw new SupabaseRepositoryError(
    "INVALID_SERVER_DATA",
    operation,
    "Revision has an invalid cost type.",
  );
}

function parseRevisionSnapshot(value: Json): GatheringProgram {
  const operation = "parseRevisionSnapshot";
  const program = asObject(value);
  const detail = program?.detail === undefined ? null : asObject(program.detail);
  if (!program || !detail || program.type !== "GATHERING") {
    throw new SupabaseRepositoryError(
      "INVALID_SERVER_DATA",
      operation,
      "Supabase returned an invalid Gathering revision snapshot.",
    );
  }
  const capacity = program.capacity;
  const waitlistEnabled = detail.waitlistEnabled;
  if (typeof capacity !== "number" || typeof waitlistEnabled !== "boolean") {
    throw new SupabaseRepositoryError(
      "INVALID_SERVER_DATA",
      operation,
      "Gathering revision capacity or waitlist state is invalid.",
    );
  }
  const category = requiredString(detail.category, operation, "category");
  const status = requiredString(program.status, operation, "status");
  return {
    id: requiredString(program.id, operation, "id"),
    code: requiredString(program.code, operation, "code"),
    type: "GATHERING",
    title: requiredString(program.title, operation, "title"),
    description: requiredString(program.description, operation, "description"),
    hostId: requiredString(program.hostId, operation, "hostId"),
    startAt: requiredString(program.startAt, operation, "startAt"),
    endAt: nullableString(program.endAt),
    location: requiredString(program.location, operation, "location"),
    mapUrl: nullableString(program.mapUrl),
    capacity,
    status: status as ProgramStatus,
    coverImageId: nullableString(program.coverImageId),
    createdAt: requiredString(program.createdAt, operation, "createdAt"),
    updatedAt: requiredString(program.updatedAt, operation, "updatedAt"),
    detail: {
      programId: requiredString(detail.programId, operation, "detail.programId"),
      category: category as GatheringProgram["detail"]["category"],
      meetingPoint: nullableString(detail.meetingPoint),
      recruitmentDeadline: nullableString(detail.recruitmentDeadline),
      waitlistEnabled,
      cost: parseRevisionCost(detail.cost),
      bringItems: nullableString(detail.bringItems),
      notice: nullableString(detail.notice),
    },
  };
}

function mapRevisionRow(row: ProgramRevisionRow): GatheringProgramRevision {
  return {
    id: row.id,
    programId: row.program_id,
    approvalId: row.approval_id,
    proposedBy: row.proposed_by,
    proposedProgram: parseRevisionSnapshot(row.proposed_snapshot),
    changedFields: row.changed_fields,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function gatheringInputPayload(input: CreateGatheringInput): Json {
  const cost: Json =
    input.cost.type === "FREE"
      ? { type: "FREE" }
      : input.cost.type === "INDIVIDUAL_PURCHASE"
        ? {
            type: input.cost.type,
            estimatedPrice: input.cost.estimatedPrice,
            purchaseUrl: input.cost.purchaseUrl,
            purchaseNote: input.cost.purchaseNote,
          }
        : {
            type: input.cost.type,
            participationFee: input.cost.participationFee,
            feeIncludes: input.cost.feeIncludes,
            paymentInfo: input.cost.paymentInfo,
            paymentDeadline: input.cost.paymentDeadline,
            cancellationPolicy: input.cost.cancellationPolicy,
          };
  return {
    title: input.title,
    category: input.category,
    description: input.description,
    startAt: input.startAt,
    endAt: input.endAt,
    location: input.location,
    meetingPoint: input.meetingPoint,
    mapUrl: input.mapUrl,
    capacity: input.capacity,
    recruitmentDeadline: input.recruitmentDeadline,
    waitlistEnabled: input.waitlistEnabled,
    cost,
    bringItems: input.bringItems,
    notice: input.notice,
  };
}

function recordMaterialPayload(input: CreateRecordInput): Json {
  return (input.materials ?? []).map((material) =>
    material.type === "PHOTO"
      ? {
          type: material.type,
          mediaId: material.mediaId,
          label: material.label ?? null,
        }
      : {
          type: material.type,
          url: material.url,
          label: material.label ?? null,
        },
  );
}

function normalizeFailureMessage(error: SupabaseFailure): string {
  return [error.message, error.details, error.hint]
    .filter((item): item is string => Boolean(item))
    .join(" ")
    .toUpperCase();
}

function throwRepositoryFailure(operation: string, error: SupabaseFailure): never {
  const message = normalizeFailureMessage(error);
  if (message.includes("UNAUTHORIZED") || error.code === "PGRST301") {
    throw new RepositoryError("UNAUTHORIZED", "로그인이 필요합니다.");
  }
  if (message.includes("FORBIDDEN") || error.code === "42501") {
    throw new RepositoryError("FORBIDDEN", "이 작업을 수행할 권한이 없습니다.");
  }
  if (
    message.includes("NOT_FOUND") ||
    message.includes("APPROVAL_NOT_FOUND") ||
    message.includes("RECORD_NOT_FOUND")
  ) {
    throw new RepositoryError("NOT_FOUND", "요청한 데이터를 찾을 수 없습니다.");
  }
  if (message.includes("ALREADY_JOINED") || error.code === "23505") {
    throw new RepositoryError("ALREADY_JOINED", "이미 참여 중인 Program입니다.");
  }
  if (message.includes("CAPACITY_FULL")) {
    throw new RepositoryError("CAPACITY_FULL", "모집 정원이 마감되었습니다.");
  }
  if (message.includes("RECRUITMENT_CLOSED")) {
    throw new RepositoryError("RECRUITMENT_CLOSED", "모집이 마감되었습니다.");
  }
  if (message.includes("NOT_OPEN")) {
    throw new RepositoryError("NOT_OPEN", "현재 모집 중인 Program이 아닙니다.");
  }
  if (
    message.includes("APPROVAL_REQUIRED") ||
    message.includes("NO_PUBLISHED_VERSION")
  ) {
    throw new RepositoryError(
      "APPROVAL_REQUIRED",
      "운영진 승인 후 진행할 수 있습니다.",
    );
  }
  if (
    message.includes("INVALID_TRANSITION") ||
    message.includes("REVISION_REVIEW_REQUIRED") ||
    message.includes("RECORD_ALREADY_EXISTS") ||
    message.includes("NO_MATERIAL_CHANGES")
  ) {
    throw new RepositoryError("INVALID_TRANSITION", "현재 상태에서는 진행할 수 없습니다.");
  }
  if (
    message.includes("REQUIRED") ||
    message.includes("INVALID_") ||
    error.code === "23514" ||
    error.code === "22P02"
  ) {
    throw new RepositoryError("VALIDATION", "입력 내용을 확인해 주세요.");
  }
  throw new SupabaseRepositoryError(
    "QUERY_FAILED",
    operation,
    error.message,
    error.code ?? null,
  );
}

/**
 * Browser-side Supabase adapter. All authorization comes from auth.uid(), RLS,
 * and transaction RPCs. Legacy viewer/actor IDs are compatibility parameters
 * only and are never trusted as proof of identity.
 */
export class SupabaseOARepository implements OARepository {
  private readonly listeners = new Set<Listener>();
  private readonly talkSubscriptions = new Map<string, TalkSubscription>();
  private revision = 0;
  private readonly serverSnapshot = EMPTY_SNAPSHOT;

  constructor(private readonly client: SupabaseClient<Database>) {}

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): Readonly<RepositorySnapshot> => ({
    revision: this.revision,
  });

  getServerSnapshot = (): Readonly<RepositorySnapshot> => this.serverSnapshot;

  async listPrograms(
    filter: ProgramFilter = {},
    now: ISODateTime = new Date().toISOString(),
  ): Promise<ProgramSnapshot[]> {
    const model = await this.loadVisibleModel();
    return this.withAggregateCounts(selectPrograms(
      model.programs,
      model.users,
      model.participations,
      model.records,
      filter,
      now,
    ), model, now);
  }

  async getProgramById(
    programId: string,
    viewerId: string | null = null,
  ): Promise<Program | null> {
    void viewerId;
    const programs = await this.loadPrograms([programId]);
    return programs[0] ?? null;
  }

  async getProgramSnapshotById(
    programId: string,
    now: ISODateTime = new Date().toISOString(),
    viewerId: string | null = null,
  ): Promise<ProgramSnapshot | null> {
    void viewerId;
    const model = await this.loadVisibleModel([programId]);
    const program = model.programs[0];
    return program
      ? this.withAggregateCounts([
          buildProgramSnapshot(
          program,
          model.users,
          model.participations,
          model.records,
          now,
          ),
        ], model, now)[0]
      : null;
  }

  async getHomeData(
    now: ISODateTime = new Date().toISOString(),
  ): Promise<HomeData> {
    const model = await this.loadVisibleModel();
    const selected = selectHomeData(
      model.programs,
      model.users,
      model.participations,
      model.records,
      now,
    );
    return {
      ...selected,
      next: selected.next
        ? this.withAggregateCounts([selected.next], model, now)[0]
        : null,
      open: this.withAggregateCounts(selected.open, model, now),
    };
  }

  async listMyActions(
    userId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<HomeAction[]> {
    void userId;
    void now;
    const actorId = await this.currentUserId();
    const [model, approvals] = await Promise.all([
      this.loadVisibleModel(),
      this.loadApprovals(),
    ]);
    const actions: HomeAction[] = [];

    for (const approval of approvals) {
      if (
        approval.requesterId !== actorId ||
        approval.status !== "CHANGES_REQUESTED"
      ) {
        continue;
      }
      const program = model.programs.find((item) => item.id === approval.programId);
      if (!program) continue;
      actions.push({
        type: "CHANGES_REQUESTED",
        programId: program.id,
        programTitle: program.title,
        description: approval.reviewComment ?? "운영진의 수정 요청을 확인해 주세요.",
        createdAt: approval.reviewedAt ?? approval.requestedAt ?? program.updatedAt,
      });
    }

    for (const program of model.programs) {
      if (
        program.hostId === actorId &&
        program.status === "COMPLETED" &&
        !model.records.some((record) => record.programId === program.id)
      ) {
        actions.push({
          type: "RECORD_REQUIRED",
          programId: program.id,
          programTitle: program.title,
          description: "Program의 WHAT 기록을 남겨 주세요.",
          createdAt: program.updatedAt,
        });
      }
    }

    for (const participation of model.participations) {
      if (
        participation.userId !== actorId ||
        participation.status !== "CONFIRMED" ||
        participation.paymentStatus !== "PENDING"
      ) {
        continue;
      }
      const program = model.programs.find(
        (item) => item.id === participation.programId,
      );
      if (!program || program.type !== "GATHERING") continue;
      if (
        !["OPEN", "CLOSED"].includes(program.status) ||
        program.detail.cost.type !== "HOST_COLLECT"
      ) {
        continue;
      }
      actions.push({
        type: "PAYMENT_REQUIRED",
        programId: program.id,
        programTitle: program.title,
        description: "참여비 납부 정보를 확인해 주세요.",
        createdAt: participation.joinedAt,
      });
    }

    const priority: Record<HomeAction["type"], number> = {
      CHANGES_REQUESTED: 0,
      RECORD_REQUIRED: 1,
      PAYMENT_REQUIRED: 2,
    };
    return actions.sort(
      (left, right) =>
        priority[left.type] - priority[right.type] ||
        Date.parse(right.createdAt) - Date.parse(left.createdAt),
    );
  }

  async listCalendarPrograms(
    from: ISODateTime,
    to: ISODateTime,
    now: ISODateTime = new Date().toISOString(),
    scope: CalendarScope = "ALL",
    viewerId: string | null = null,
  ): Promise<ProgramSnapshot[]> {
    void viewerId;
    const actorId = scope === "MINE" ? await this.currentUserId() : null;
    const model = await this.loadVisibleModel();
    return this.withAggregateCounts(selectCalendarPrograms(
      model.programs,
      model.users,
      model.participations,
      model.records,
      from,
      to,
      now,
      scope,
      actorId,
    ), model, now);
  }

  async submitGatheringForApproval(
    input: CreateGatheringInput,
    requesterId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<ProgramApprovalSnapshot> {
    void requesterId;
    const response = await this.client.rpc("create_gathering_proposal", {
      p_snapshot: gatheringInputPayload(input),
    });
    if (response.error) {
      throwRepositoryFailure("create_gathering_proposal", response.error);
    }
    this.invalidate();
    const snapshots = await this.buildApprovalSnapshots([response.data], now);
    if (!snapshots[0]) {
      throw new SupabaseRepositoryError(
        "INVALID_SERVER_DATA",
        "submitGatheringForApproval",
        "The created proposal is not visible after the transaction.",
      );
    }
    return snapshots[0];
  }

  async resubmitGatheringForApproval(
    programId: string,
    input: CreateGatheringInput,
    requesterId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<ProgramApprovalSnapshot> {
    void requesterId;
    const response = await this.client.rpc("resubmit_gathering_proposal", {
      p_program_id: programId,
      p_snapshot: gatheringInputPayload(input),
    });
    if (response.error) {
      throwRepositoryFailure("resubmit_gathering_proposal", response.error);
    }
    this.invalidate();
    const snapshots = await this.buildApprovalSnapshots([response.data], now);
    if (!snapshots[0]) {
      throw new SupabaseRepositoryError(
        "INVALID_SERVER_DATA",
        "resubmitGatheringForApproval",
        "The resubmitted proposal is not visible after the transaction.",
      );
    }
    return snapshots[0];
  }

  async publishGathering(
    input: CreateGatheringInput,
    adminId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<GatheringProgram> {
    void adminId;
    void now;
    const response = await this.client.rpc("publish_gathering", {
      p_snapshot: gatheringInputPayload(input),
    });
    if (response.error) throwRepositoryFailure("publish_gathering", response.error);
    this.invalidate();
    const program = await this.getProgramById(response.data.id);
    if (!program || program.type !== "GATHERING") {
      throw new SupabaseRepositoryError(
        "INVALID_SERVER_DATA",
        "publishGathering",
        "The published Gathering is not visible after the transaction.",
      );
    }
    return program;
  }

  async updateGathering(
    programId: string,
    input: CreateGatheringInput,
    actorId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<GatheringProgram> {
    void actorId;
    void now;
    const response = await this.client.rpc("update_gathering", {
      p_program_id: programId,
      p_snapshot: gatheringInputPayload(input),
    });
    if (response.error) throwRepositoryFailure("update_gathering", response.error);
    this.invalidate();
    const program = await this.getProgramById(response.data.id);
    if (!program || program.type !== "GATHERING") {
      throw new SupabaseRepositoryError(
        "INVALID_SERVER_DATA",
        "updateGathering",
        "The updated Gathering is not visible after the transaction.",
      );
    }
    return program;
  }

  async setProgramStatus(
    programId: string,
    status: ProgramStatus,
    actorId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<Program> {
    void actorId;
    void now;
    const response = await this.client.rpc("set_program_status", {
      p_program_id: programId,
      p_status: status,
    });
    if (response.error) throwRepositoryFailure("set_program_status", response.error);
    this.invalidate();
    const program = await this.getProgramById(response.data.id);
    if (!program) {
      throw new SupabaseRepositoryError(
        "INVALID_SERVER_DATA",
        "setProgramStatus",
        "The updated Program is not visible after the status mutation.",
      );
    }
    return program;
  }

  async listHostedPrograms(
    userId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<ProgramSnapshot[]> {
    void userId;
    const actorId = await this.currentUserId();
    const model = await this.loadVisibleModel();
    return this.withAggregateCounts(selectHostedPrograms(
      model.programs,
      model.users,
      model.participations,
      model.records,
      actorId,
      now,
    ), model, now);
  }

  async getHostDashboard(
    programId: string,
    viewerId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<HostDashboard> {
    void viewerId;
    const [snapshot, response] = await Promise.all([
      this.getProgramSnapshotById(programId, now),
      this.client.rpc("list_program_host_participants", {
        p_program_id: programId,
      }),
    ]);
    if (response.error) {
      throwRepositoryFailure("list_program_host_participants", response.error);
    }
    if (!snapshot) {
      throw new RepositoryError("NOT_FOUND", "프로그램을 찾을 수 없습니다.");
    }
    const participants = response.data.map((row) =>
      mapHostParticipantReadRow(row, programId),
    );
    const participationRows = participants.map((item) => item.participation);
    const participantCounts = getParticipantCounts(participationRows);
    const dashboardSnapshot: ProgramSnapshot = {
      ...snapshot,
      participantCounts,
      displayStatus: getProgramDisplayStatus(
        snapshot.program,
        snapshot.record,
        now,
        participantCounts.confirmed,
      ),
    };
    return {
      snapshot: dashboardSnapshot,
      participants,
      payment: {
        paid: participationRows.filter(
          (item) =>
            item.status === "CONFIRMED" && item.paymentStatus === "PAID",
        ).length,
        pending: participationRows.filter(
          (item) =>
            item.status === "CONFIRMED" && item.paymentStatus === "PENDING",
        ).length,
      },
    };
  }

  async getProgramApproval(
    programId: string,
    viewerId: string,
  ): Promise<ProgramApproval | null> {
    void viewerId;
    const response = await this.client
      .from("program_approvals")
      .select("*")
      .eq("program_id", programId)
      .maybeSingle();
    if (response.error) throwRepositoryFailure("getProgramApproval", response.error);
    return response.data ? mapApprovalRow(response.data) : null;
  }

  async getGatheringRevision(
    programId: string,
    viewerId: string,
  ): Promise<GatheringProgramRevision | null> {
    void viewerId;
    const response = await this.client
      .from("program_revisions")
      .select("*")
      .eq("program_id", programId)
      .maybeSingle();
    if (response.error) throwRepositoryFailure("getGatheringRevision", response.error);
    return response.data ? mapRevisionRow(response.data) : null;
  }

  async listMyProposals(
    requesterId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<ProgramApprovalSnapshot[]> {
    void requesterId;
    const actorId = await this.currentUserId();
    const response = await this.client
      .from("program_approvals")
      .select("*")
      .eq("requester_id", actorId)
      .neq("status", "NOT_REQUIRED")
      .order("requested_at", { ascending: false });
    if (response.error) throwRepositoryFailure("listMyProposals", response.error);
    return this.buildApprovalSnapshots(response.data, now);
  }

  async listApprovalQueue(
    reviewerId: string,
    statuses: readonly ApprovalStatus[] = ["PENDING"],
    now: ISODateTime = new Date().toISOString(),
  ): Promise<ProgramApprovalSnapshot[]> {
    void reviewerId;
    await this.currentUserId();
    const response = await this.client
      .from("program_approvals")
      .select("*")
      .in("status", [...statuses])
      .order("requested_at", { ascending: true });
    if (response.error) throwRepositoryFailure("listApprovalQueue", response.error);
    return this.buildApprovalSnapshots(response.data, now);
  }

  async reviewProgramApproval(
    programId: string,
    decision: ProgramApprovalDecision,
    reviewerId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<ProgramApprovalSnapshot> {
    void reviewerId;
    const revision = await this.getGatheringRevision(programId, "");
    const rpcName = revision ? "review_program_revision" : "review_program_approval";
    const response = await this.client.rpc(rpcName, {
      p_program_id: programId,
      p_decision: decision.status,
      p_comment: "comment" in decision ? decision.comment ?? null : null,
    });
    if (response.error) throwRepositoryFailure(rpcName, response.error);
    this.invalidate();
    const [snapshot, nextRevision] = await Promise.all([
      this.getProgramSnapshotById(programId, now),
      this.getGatheringRevision(programId, ""),
    ]);
    if (!snapshot) {
      throw new SupabaseRepositoryError(
        "INVALID_SERVER_DATA",
        "reviewProgramApproval",
        "Reviewed Program is not visible after the transaction.",
      );
    }
    return {
      approval: mapApprovalRow(response.data),
      snapshot,
      revision: nextRevision,
    };
  }

  async getPageContent(key: PageContentKey): Promise<PageContent | null> {
    const response = await this.client
      .from("page_content")
      .select("*")
      .eq("key", key)
      .maybeSingle();
    if (response.error) throwRepositoryFailure("getPageContent", response.error);
    return response.data ? mapPageContentRow(response.data) : null;
  }

  async listPageContents(): Promise<PageContent[]> {
    const response = await this.client.from("page_content").select("*").order("key");
    if (response.error) throwRepositoryFailure("listPageContents", response.error);
    return response.data.map(mapPageContentRow);
  }

  async updatePageContent(
    key: PageContentKey,
    input: UpdatePageContentInput,
    adminId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<PageContent> {
    void adminId;
    void now;
    const actorId = await this.currentUserId();
    const response = await this.client
      .from("page_content")
      .update({
        title: input.title.trim(),
        headline: input.headline.trim(),
        description: input.description.trim(),
        empty_state: input.emptyState.trim(),
        updated_by: actorId,
      })
      .eq("key", key)
      .select("*")
      .single();
    if (response.error) throwRepositoryFailure("updatePageContent", response.error);
    this.invalidate();
    return mapPageContentRow(response.data);
  }

  async joinProgram(
    programId: string,
    userId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<JoinOutcome> {
    void userId;
    void now;
    const response = await this.client.rpc("join_program", {
      p_program_id: programId,
    });
    if (response.error) throwRepositoryFailure("join_program", response.error);
    const participation = mapParticipationRow(response.data);
    this.invalidate();
    return {
      participation,
      placement:
        participation.status === "WAITLIST" ? "WAITLIST" : "CONFIRMED",
    };
  }

  async cancelParticipation(
    programId: string,
    userId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<Participation> {
    void userId;
    void now;
    const response = await this.client.rpc("cancel_own_participation", {
      p_program_id: programId,
    });
    if (response.error) {
      throwRepositoryFailure("cancel_own_participation", response.error);
    }
    this.invalidate();
    return mapParticipationRow(response.data);
  }

  async getParticipation(
    programId: string,
    userId: string,
  ): Promise<Participation | null> {
    void userId;
    const actorId = await this.currentUserId();
    const response = await this.client
      .from("participations")
      .select("*")
      .eq("program_id", programId)
      .eq("user_id", actorId)
      .maybeSingle();
    if (response.error) throwRepositoryFailure("getParticipation", response.error);
    return response.data ? mapParticipationRow(response.data) : null;
  }

  async listParticipationsForProgram(programId: string): Promise<Participation[]> {
    const response = await this.client
      .from("participations")
      .select("*")
      .eq("program_id", programId)
      .order("joined_at", { ascending: true });
    if (response.error) {
      throwRepositoryFailure("listParticipationsForProgram", response.error);
    }
    return response.data.map(mapParticipationRow);
  }

  async listMyUpcoming(
    userId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<ProgramSnapshot[]> {
    void userId;
    const actorId = await this.currentUserId();
    const model = await this.loadVisibleModel();
    return this.withAggregateCounts(selectMyUpcoming(
      model.programs,
      model.users,
      model.participations,
      model.records,
      actorId,
      now,
    ), model, now);
  }

  async confirmParticipationPayment(
    participationId: string,
    actorId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<Participation> {
    void actorId;
    void now;
    const response = await this.client.rpc("confirm_participation_payment", {
      p_participation_id: participationId,
    });
    if (response.error) {
      throwRepositoryFailure("confirm_participation_payment", response.error);
    }
    this.invalidate();
    return mapParticipationRow(response.data);
  }

  async getRecordByProgramId(programId: string): Promise<ProgramRecord | null> {
    const snapshot = await this.getRecordSnapshotByProgramId(programId);
    return snapshot?.record ?? null;
  }

  async getRecordSnapshotByProgramId(
    programId: string,
  ): Promise<ProgramRecordSnapshot | null> {
    const response = await this.client
      .from("records")
      .select("*")
      .eq("program_id", programId)
      .maybeSingle();
    if (response.error) throwRepositoryFailure("getRecordByProgramId", response.error);
    if (!response.data) return null;
    return this.loadRecordSnapshot(response.data);
  }

  async listRecords(): Promise<ProgramRecord[]> {
    const { records } = await this.loadRecords();
    return records;
  }

  async createRecord(
    programId: string,
    input: CreateRecordInput,
    authorId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<ProgramRecordSnapshot> {
    void authorId;
    void now;
    const response = await this.client.rpc("create_program_record", {
      p_program_id: programId,
      p_what: input.what,
      p_found: input.found ?? null,
      p_materials: recordMaterialPayload(input),
    });
    if (response.error) throwRepositoryFailure("create_program_record", response.error);
    this.invalidate();
    return this.loadRecordSnapshot(response.data);
  }

  async updateRecord(
    programId: string,
    input: CreateRecordInput,
    actorId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<ProgramRecordSnapshot> {
    void actorId;
    void now;
    const response = await this.client.rpc("update_program_record", {
      p_program_id: programId,
      p_what: input.what,
      p_found: input.found ?? null,
      p_materials: recordMaterialPayload(input),
    });
    if (response.error) throwRepositoryFailure("update_program_record", response.error);
    this.invalidate();
    return this.loadRecordSnapshot(response.data);
  }

  async listProgramActivities(
    programId: string,
    viewerId: string,
  ): Promise<ProgramActivity[]> {
    void viewerId;
    const response = await this.client
      .from("program_activities")
      .select("*")
      .eq("program_id", programId)
      .order("created_at", { ascending: false });
    if (response.error) throwRepositoryFailure("listProgramActivities", response.error);
    return response.data.map(mapActivityRow);
  }

  async listProgramMessages(
    programId: string,
    viewerId: string,
  ): Promise<ProgramMessage[]> {
    void viewerId;
    const response = await this.client
      .from("program_messages")
      .select("*")
      .eq("program_id", programId)
      .eq("is_hidden", false)
      .order("created_at", { ascending: true });
    if (response.error) throwRepositoryFailure("listProgramMessages", response.error);
    return response.data.map(mapMessageRow).sort((left, right) => {
      const leftPinned = left.type === "NOTICE" && left.isPinned ? 1 : 0;
      const rightPinned = right.type === "NOTICE" && right.isPinned ? 1 : 0;
      return rightPinned - leftPinned;
    });
  }

  watchProgramMessages(
    programId: string,
    onReactionChange?: MessageReactionChangeListener,
  ): () => void {
    if (typeof window === "undefined") return () => undefined;

    const existing = this.talkSubscriptions.get(programId);
    if (existing) {
      existing.references += 1;
      if (onReactionChange) existing.reactionListeners.add(onReactionChange);
      return this.releaseTalkSubscription(
        programId,
        existing,
        onReactionChange,
      );
    }

    const subscription: TalkSubscription = {
      channel: null,
      references: 1,
      reactionListeners: new Set(
        onReactionChange ? [onReactionChange] : [],
      ),
      cancelled: false,
    };
    this.talkSubscriptions.set(programId, subscription);
    void this.startTalkSubscription(programId, subscription);
    return this.releaseTalkSubscription(
      programId,
      subscription,
      onReactionChange,
    );
  }

  async postProgramMessage(
    programId: string,
    input: CreateProgramMessageInput,
    authorId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<ProgramMessage> {
    void authorId;
    void now;
    const actorId = await this.currentUserId();
    const response = await this.client
      .from("program_messages")
      .insert({
        program_id: programId,
        author_id: actorId,
        type: input.type,
        content: input.content.trim(),
        parent_id: input.parentId ?? null,
        is_pinned: input.type === "NOTICE" && Boolean(input.isPinned),
      })
      .select("*")
      .single();
    if (response.error) throwRepositoryFailure("postProgramMessage", response.error);
    this.invalidate();
    return mapMessageRow(response.data);
  }

  async listProgramMessageReactions(
    programId: string,
    viewerId: string,
    messageIds?: readonly string[],
  ): Promise<MessageReactionSnapshot[]> {
    void viewerId;
    const response = await this.client.rpc("list_program_message_reactions", {
      p_program_id: programId,
      p_message_ids: messageIds ? [...messageIds] : null,
    });
    if (response.error) {
      throwRepositoryFailure("list_program_message_reactions", response.error);
    }
    return response.data.map(mapMessageReactionRow);
  }

  async toggleProgramMessageReaction(
    programId: string,
    messageId: string,
    emoji: MessageReactionEmoji,
    actorId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<MessageReactionSnapshot | null> {
    void actorId;
    void now;
    if (!isMessageReactionEmoji(emoji)) {
      throw new RepositoryError("VALIDATION", "허용되지 않은 반응입니다.");
    }
    const response = await fetch(
      `/api/programs/${encodeURIComponent(programId)}/messages/${encodeURIComponent(messageId)}/reactions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emoji }),
      },
    );
    const payload = (await response.json().catch(() => null)) as
      | { error?: string; reaction?: MessageReactionReadRow | null }
      | null;
    if (!response.ok) {
      const message = payload?.error ?? "반응을 저장하지 못했습니다.";
      if (response.status === 401) {
        throw new RepositoryError("UNAUTHORIZED", message);
      }
      if (response.status === 403) {
        throw new RepositoryError("FORBIDDEN", message);
      }
      if (response.status === 404) {
        throw new RepositoryError("NOT_FOUND", message);
      }
      if (response.status === 400 || response.status === 422) {
        throw new RepositoryError("VALIDATION", message);
      }
      throw new SupabaseRepositoryError(
        "QUERY_FAILED",
        "toggleProgramMessageReaction",
        message,
        String(response.status),
      );
    }
    return payload?.reaction ? mapMessageReactionRow(payload.reaction) : null;
  }

  async listAdminPrograms(
    viewerId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<ProgramSnapshot[]> {
    void viewerId;
    const model = await this.loadAdminVisibleModel();
    return model.programs.map((program) =>
      buildProgramSnapshot(
        program,
        model.users,
        model.participations,
        model.records,
        now,
      ),
    );
  }

  async listAdminMessages(viewerId: string): Promise<ProgramMessage[]> {
    void viewerId;
    await this.assertAdmin();
    const response = await this.client
      .from("program_messages")
      .select("*")
      .order("created_at", { ascending: false });
    if (response.error) throwRepositoryFailure("listAdminMessages", response.error);
    return response.data.map(mapMessageRow);
  }

  async listAdminMemberRegistrations(
    viewerId: string,
  ): Promise<AdminMemberRegistration[]> {
    void viewerId;
    await this.assertAdmin();
    const response = await this.client.rpc("list_admin_member_registrations");
    if (response.error) {
      throwRepositoryFailure("list_admin_member_registrations", response.error);
    }
    return response.data.map(mapAdminMemberRegistrationRow);
  }

  async approvePendingMember(
    userId: string,
    adminId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<AdminMemberRegistration> {
    void adminId;
    void now;
    await this.assertAdmin();
    const response = await this.client.rpc("approve_pending_member", {
      p_user_id: userId,
    });
    if (response.error) {
      throwRepositoryFailure("approve_pending_member", response.error);
    }
    const row = response.data[0];
    if (!row) {
      throw new SupabaseRepositoryError(
        "INVALID_SERVER_DATA",
        "approve_pending_member",
        "Supabase did not return the approved member registration.",
      );
    }
    this.invalidate();
    return mapAdminMemberRegistrationRow(row);
  }

  async listAdminRecords(viewerId: string): Promise<ProgramRecord[]> {
    void viewerId;
    await this.assertAdmin();
    const { records } = await this.loadRecords();
    return records;
  }

  async getUserById(userId: string): Promise<User | null> {
    const response = await this.client
      .from("users")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (response.error) throwRepositoryFailure("getUserById", response.error);
    return response.data ? mapUserRow(response.data) : null;
  }

  async listUsers(viewerId: string): Promise<User[]> {
    void viewerId;
    await this.currentUserId();
    const response = await this.client
      .from("users")
      .select("*")
      .order("name", { ascending: true });
    if (response.error) throwRepositoryFailure("listUsers", response.error);
    return response.data.map(mapUserRow);
  }

  async listMemberDirectory(): Promise<MemberDirectoryEntry[]> {
    const response = await this.client.rpc("list_active_members");
    if (response.error) throwRepositoryFailure("list_active_members", response.error);
    return response.data.map((row) => ({
      id: row.id,
      name: row.name,
      imageUrl: null,
      occupation: row.occupation,
      bio: row.bio,
      interests: row.interests,
    }));
  }

  async listConfirmedParticipantUsers(
    programId: string,
    viewerId: string,
  ): Promise<MemberDirectoryEntry[]> {
    void viewerId;
    const response = await this.client.rpc("list_program_confirmed_people", {
      p_program_id: programId,
    });
    if (response.error) {
      throwRepositoryFailure("list_program_confirmed_people", response.error);
    }
    return response.data.map((row) => ({
      id: row.id,
      name: row.name,
      imageUrl: null,
      occupation: row.occupation,
      bio: row.bio,
      interests: row.interests,
    }));
  }

  private async currentUserId(): Promise<string> {
    const response = await this.client.auth.getUser();
    if (response.error || !response.data.user) {
      throw new RepositoryError("UNAUTHORIZED", "로그인이 필요합니다.");
    }
    return response.data.user.id;
  }

  private async assertAdmin(): Promise<string> {
    const actorId = await this.currentUserId();
    const response = await this.client.rpc("is_oa_admin");
    if (response.error) throwRepositoryFailure("is_oa_admin", response.error);
    if (!response.data) {
      throw new RepositoryError("FORBIDDEN", "운영진 권한이 필요합니다.");
    }
    return actorId;
  }

  private async loadPrograms(programIds?: readonly string[]): Promise<Program[]> {
    let query = this.client.from("programs").select("*");
    if (programIds) {
      if (programIds.length === 0) return [];
      query = query.in("id", [...programIds]);
    }
    const programResponse = await query.order("start_at", { ascending: true });
    if (programResponse.error) throwRepositoryFailure("loadPrograms", programResponse.error);
    const rows = programResponse.data;
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const [gatheringResponse, talkResponse, readingResponse, paymentResponse] =
      await Promise.all([
        this.client.from("gathering_details").select("*").in("program_id", ids),
        this.client.from("talk_details").select("*").in("program_id", ids),
        this.client.from("reading_details").select("*").in("program_id", ids),
        this.client
          .from("gathering_payment_instructions")
          .select("*")
          .in("program_id", ids),
      ]);
    if (gatheringResponse.error) {
      throwRepositoryFailure("loadGatheringDetails", gatheringResponse.error);
    }
    if (talkResponse.error) throwRepositoryFailure("loadTalkDetails", talkResponse.error);
    if (readingResponse.error) {
      throwRepositoryFailure("loadReadingDetails", readingResponse.error);
    }
    if (paymentResponse.error) {
      throwRepositoryFailure("loadPaymentInstructions", paymentResponse.error);
    }
    const gatherings = new Map(
      gatheringResponse.data.map((row) => [row.program_id, row]),
    );
    const talks = new Map(talkResponse.data.map((row) => [row.program_id, row]));
    const readings = new Map(
      readingResponse.data.map((row) => [row.program_id, row]),
    );
    const payments = new Map(
      paymentResponse.data.map((row) => [row.program_id, row]),
    );
    return rows.map((row) =>
      mapProgramRow(
        row,
        gatherings.get(row.id) ?? null,
        talks.get(row.id) ?? null,
        readings.get(row.id) ?? null,
        payments.get(row.id) ?? null,
      ),
    );
  }

  private async loadVisibleModel(
    programIds?: readonly string[],
  ): Promise<VisibleModel> {
    const programs = await this.loadPrograms(programIds);
    const ids = programs.map((program) => program.id);
    if (ids.length === 0) {
      return {
        programs,
        users: [],
        participations: [],
        records: [],
        participantCounts: new Map(),
      };
    }
    const [hostEntries, participationsResponse, recordModel, countEntries] = await Promise.all([
      Promise.all(programs.map(async (program) => {
        const response = await this.client.rpc("get_program_host_profile", {
          p_program_id: program.id,
        });
        if (response.error) {
          throwRepositoryFailure("get_program_host_profile", response.error);
        }
        const row = response.data[0];
        return row ? mapSafeMemberRow(row) : null;
      })),
      this.client.from("participations").select("*").in("program_id", ids),
      this.loadRecords(ids),
      Promise.all(ids.map(async (programId) => {
        const response = await this.client.rpc("get_program_participant_counts", {
          p_program_id: programId,
        });
        if (response.error) {
          throwRepositoryFailure("get_program_participant_counts", response.error);
        }
        const row = response.data[0];
        return [
          programId,
          {
            confirmed: row?.confirmed_count ?? 0,
            waitlist: row?.waitlist_count ?? 0,
          },
        ] as const;
      })),
    ]);
    if (participationsResponse.error) {
      throwRepositoryFailure("loadProgramParticipations", participationsResponse.error);
    }
    const users = [
      ...new Map(
        hostEntries
          .filter((host): host is MemberDirectoryEntry => host !== null)
          .map((host) => [host.id, host]),
      ).values(),
    ];
    return {
      programs,
      users,
      participations: participationsResponse.data.map(mapParticipationRow),
      records: recordModel.records,
      participantCounts: new Map(countEntries),
    };
  }

  /**
   * Admin inventory uses one batched query per relation. In particular, it
   * avoids the public read model's per-Program host/count RPCs and keeps DRAFT
   * Programs in the result; RLS still remains the final authorization layer.
   */
  private async loadAdminVisibleModel(): Promise<VisibleModel> {
    await this.assertAdmin();
    const programs = await this.loadPrograms();
    const ids = programs.map((program) => program.id);
    if (ids.length === 0) {
      return {
        programs,
        users: [],
        participations: [],
        records: [],
        participantCounts: new Map(),
      };
    }

    const hostIds = [...new Set(programs.map((program) => program.hostId))];
    const [hostResponse, participationsResponse, recordModel] = await Promise.all([
      this.client
        .from("users")
        .select("id, name, image_media_id, occupation, bio, interests")
        .in("id", hostIds),
      this.client.from("participations").select("*").in("program_id", ids),
      this.loadRecords(ids),
    ]);
    if (hostResponse.error) {
      throwRepositoryFailure("loadAdminProgramHosts", hostResponse.error);
    }
    if (participationsResponse.error) {
      throwRepositoryFailure(
        "loadAdminProgramParticipations",
        participationsResponse.error,
      );
    }

    return {
      programs,
      users: hostResponse.data.map((row) => mapSafeMemberRow(row)),
      participations: participationsResponse.data.map(mapParticipationRow),
      records: recordModel.records,
      participantCounts: new Map(),
    };
  }

  private withAggregateCounts(
    snapshots: readonly ProgramSnapshot[],
    model: VisibleModel,
    now: ISODateTime,
  ): ProgramSnapshot[] {
    return snapshots.map((snapshot) => {
      const aggregate = model.participantCounts.get(snapshot.program.id);
      if (!aggregate) return snapshot;
      const participantCounts: ParticipantCounts = {
        applied: 0,
        cancelled: 0,
        ...aggregate,
      };
      return {
        ...snapshot,
        participantCounts,
        displayStatus: getProgramDisplayStatus(
          snapshot.program,
          snapshot.record,
          now,
          participantCounts.confirmed,
        ),
      };
    });
  }

  private async loadRecords(
    programIds?: readonly string[],
  ): Promise<{ records: ProgramRecord[]; materials: RecordMaterial[] }> {
    let query = this.client.from("records").select("*");
    if (programIds) {
      if (programIds.length === 0) return { records: [], materials: [] };
      query = query.in("program_id", [...programIds]);
    }
    const recordResponse = await query.order("created_at", { ascending: false });
    if (recordResponse.error) throwRepositoryFailure("loadRecords", recordResponse.error);
    const rows = recordResponse.data;
    if (rows.length === 0) return { records: [], materials: [] };
    const materialResponse = await this.client
      .from("record_materials")
      .select("*")
      .in(
        "record_id",
        rows.map((row) => row.id),
      )
      .order("position", { ascending: true });
    if (materialResponse.error) {
      throwRepositoryFailure("loadRecordMaterials", materialResponse.error);
    }
    const materials = materialResponse.data.map(mapRecordMaterialRow);
    return {
      records: rows.map((row) =>
        mapRecordRow(
          row,
          materials.filter((material) => material.recordId === row.id),
        ),
      ),
      materials,
    };
  }

  private async loadRecordSnapshot(row: RecordRow): Promise<ProgramRecordSnapshot> {
    const response = await this.client
      .from("record_materials")
      .select("*")
      .eq("record_id", row.id)
      .order("position", { ascending: true });
    if (response.error) throwRepositoryFailure("loadRecordSnapshot", response.error);
    const materials = response.data.map(mapRecordMaterialRow);
    return { record: mapRecordRow(row, materials), materials };
  }

  private async loadApprovals(): Promise<ProgramApproval[]> {
    const response = await this.client.from("program_approvals").select("*");
    if (response.error) throwRepositoryFailure("loadApprovals", response.error);
    return response.data.map(mapApprovalRow);
  }

  private async buildApprovalSnapshots(
    rows: readonly ProgramApprovalRow[],
    now: ISODateTime,
  ): Promise<ProgramApprovalSnapshot[]> {
    if (rows.length === 0) return [];
    const programIds = rows.map((row) => row.program_id);
    const [model, revisionResponse] = await Promise.all([
      this.loadVisibleModel(programIds),
      this.client
        .from("program_revisions")
        .select("*")
        .in("program_id", programIds),
    ]);
    if (revisionResponse.error) {
      throwRepositoryFailure("loadApprovalRevisions", revisionResponse.error);
    }
    const revisions = new Map(
      revisionResponse.data.map((row) => [row.program_id, mapRevisionRow(row)]),
    );
    return rows.flatMap((row) => {
      const approval = mapApprovalRow(row);
      const revision = revisions.get(row.program_id) ?? null;
      const program =
        revision?.proposedProgram ??
        model.programs.find((item) => item.id === row.program_id);
      if (!program) return [];
      return [
        {
          approval,
          snapshot: this.withAggregateCounts([buildProgramSnapshot(
            program,
            model.users,
            model.participations,
            model.records,
            now,
          )], model, now)[0],
          revision,
        },
      ];
    });
  }

  private releaseTalkSubscription(
    programId: string,
    subscription: TalkSubscription,
    onReactionChange?: MessageReactionChangeListener,
  ): () => void {
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const current = this.talkSubscriptions.get(programId);
      if (current !== subscription) return;
      if (onReactionChange) current.reactionListeners.delete(onReactionChange);
      current.references -= 1;
      if (current.references > 0) return;

      current.cancelled = true;
      this.talkSubscriptions.delete(programId);
      if (current.channel) void this.client.removeChannel(current.channel);
    };
  }

  private async startTalkSubscription(
    programId: string,
    subscription: TalkSubscription,
  ): Promise<void> {
    try {
      await this.client.realtime.setAuth();
    } catch {
      return;
    }
    if (
      subscription.cancelled ||
      this.talkSubscriptions.get(programId) !== subscription
    ) return;

    const notifyReaction = (payload: unknown) => {
      const messageId = findReactionMessageId(payload);
      if (!messageId) {
        this.invalidate();
        return;
      }
      for (const listener of subscription.reactionListeners) listener(messageId);
    };
    const channel = this.client
      .channel(`oa-program-talk:${programId}`, {
        config: { private: true },
      })
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "program_messages",
          filter: `program_id=eq.${programId}`,
        },
        () => this.invalidate(),
      )
      .on("broadcast", { event: "INSERT" }, notifyReaction)
      .on("broadcast", { event: "UPDATE" }, notifyReaction)
      .on("broadcast", { event: "DELETE" }, notifyReaction)
      .subscribe();
    if (
      subscription.cancelled ||
      this.talkSubscriptions.get(programId) !== subscription
    ) {
      void this.client.removeChannel(channel);
      return;
    }
    subscription.channel = channel;
  }

  private invalidate(): void {
    this.revision += 1;
    for (const listener of this.listeners) listener();
  }

}

export function createSupabaseRepository(
  client: SupabaseClient<Database>,
): OARepository {
  return new SupabaseOARepository(client);
}
