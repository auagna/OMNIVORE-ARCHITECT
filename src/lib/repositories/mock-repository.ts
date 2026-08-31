import { MOCK_REPOSITORY_STORAGE_KEY, MOCK_SCHEMA_VERSION } from "../../constants";
import { validateCreateGatheringInput } from "../../features/gathering/model";
import {
  isMessageReactionEmoji,
  type MessageReactionChangeListener,
  type MessageReactionEmoji,
  type MessageReactionSnapshot,
} from "../../features/conversation/reactions";
import {
  buildProgramSnapshot,
  classifyGatheringChanges,
  getProgramCapabilities,
  hasMaterialGatheringChanges,
  selectApprovalQueue,
  selectCalendarPrograms,
  selectHomeData,
  selectHostedPrograms,
  selectMyProposals,
  selectMyUpcoming,
  selectPrograms,
} from "../../features/programs/model";
import {
  canManageProgram,
  canReactToProgramMessage,
  canPublishProgramDirectly,
  canReviewProgramApproval,
  canSubmitGatheringProposal,
  canViewDraftProgram,
  canViewProgramApproval,
  canViewParticipantPayment,
  canWriteProgramMessage,
  isActiveUser,
} from "../permissions";
import type {
  AdminMemberRegistration,
  ApprovalStatus,
  CalendarScope,
  CreateRecordInput,
  CreateGatheringInput,
  CreateProgramMessageInput,
  GatheringProgram,
  GatheringProgramRevision,
  HomeData,
  HomeAction,
  HostDashboard,
  ISODateTime,
  JoinOutcome,
  MemberDirectoryEntry,
  PageContent,
  PageContentKey,
  Participation,
  PaymentStatus,
  Program,
  ProgramActivity,
  ProgramActivityType,
  ProgramMessage,
  ProgramApproval,
  ProgramApprovalDecision,
  ProgramApprovalSnapshot,
  ProgramFilter,
  ProgramRecord,
  ProgramRecordSnapshot,
  ProgramSnapshot,
  ProgramStatus,
  RecordMaterial,
  UpdatePageContentInput,
  User,
} from "../../types";
import type { MockRepositoryState, OARepository } from "./contracts";
import { RepositoryError } from "./contracts";
import { createMockRepositoryState } from "./mock-data";

type Listener = () => void;

const PROGRAM_STATUS_TRANSITIONS: Record<ProgramStatus, readonly ProgramStatus[]> = {
  DRAFT: ["OPEN", "CANCELLED"],
  OPEN: ["CLOSED", "COMPLETED", "CANCELLED"],
  CLOSED: ["OPEN", "COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export interface BrowserMockRepositoryOptions {
  storageKey?: string;
  initialState?: MockRepositoryState;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }
  return Object.freeze(value) as T;
}

function isMockState(value: unknown): value is MockRepositoryState {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<MockRepositoryState>;
  return (
    candidate.schemaVersion === MOCK_SCHEMA_VERSION &&
    typeof candidate.revision === "number" &&
    Array.isArray(candidate.users) &&
    Array.isArray(candidate.programs) &&
    Array.isArray(candidate.approvals) &&
    Array.isArray(candidate.programRevisions) &&
    Array.isArray(candidate.participations) &&
    Array.isArray(candidate.records) &&
    Array.isArray(candidate.recordMaterials) &&
    Array.isArray(candidate.activities) &&
    Array.isArray(candidate.messages) &&
    Array.isArray(candidate.messageReactions) &&
    typeof candidate.participatingSeasonsByUserId === "object" &&
    candidate.participatingSeasonsByUserId !== null &&
    !Array.isArray(candidate.participatingSeasonsByUserId) &&
    Object.values(candidate.participatingSeasonsByUserId).every(
      (seasons) =>
        Array.isArray(seasons) && seasons.every((season) => typeof season === "string"),
    ) &&
    Array.isArray(candidate.pageContents)
  );
}

function uniqueId(prefix: string): string {
  const suffix =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function appendProgramActivity(
  state: MockRepositoryState,
  programId: string,
  actorId: string,
  type: ProgramActivityType,
  createdAt: ISODateTime,
  metadata: ProgramActivity["metadata"] = {},
): ProgramActivity {
  const dedupeKey = [
    programId,
    actorId,
    type,
    createdAt,
    JSON.stringify(metadata),
  ].join(":");
  const duplicate = state.activities.find(
    (activity) => activity.dedupeKey === dedupeKey,
  );
  if (duplicate) return duplicate;

  const activity: ProgramActivity = {
    id: uniqueId("activity"),
    programId,
    actorId,
    type,
    metadata: clone(metadata),
    dedupeKey,
    createdAt,
  };
  state.activities.push(activity);
  return activity;
}

function buildRecordSnapshotFromState(
  state: MockRepositoryState,
  record: ProgramRecord,
): ProgramRecordSnapshot {
  return {
    record: clone(record),
    materials: clone(
      state.recordMaterials.filter((material) => material.recordId === record.id),
    ),
  };
}

function capabilitiesForState(
  state: MockRepositoryState,
  program: Program,
  userId: string,
  now: ISODateTime = new Date().toISOString(),
) {
  const user = state.users.find((candidate) => candidate.id === userId) ?? null;
  const participation =
    state.participations.find(
      (candidate) =>
        candidate.programId === program.id && candidate.userId === userId,
    ) ?? null;
  const approval =
    state.approvals.find((candidate) => candidate.programId === program.id) ?? null;
  const record =
    state.records.find((candidate) => candidate.programId === program.id) ?? null;
  const confirmed = state.participations.filter(
    (candidate) =>
      candidate.programId === program.id && candidate.status === "CONFIRMED",
  ).length;

  return getProgramCapabilities({
    user,
    program,
    participation,
    approval,
    record,
    participantCounts: { confirmed },
    now,
  });
}

function requireAdmin(state: MockRepositoryState, userId: string): User {
  const user = state.users.find((candidate) => candidate.id === userId) ?? null;
  if (user?.status !== "ADMIN") {
    throw new RepositoryError(
      "FORBIDDEN",
      "Admin만 이 운영 정보를 확인하거나 변경할 수 있습니다.",
    );
  }
  return user;
}

function buildRecordMaterials(
  recordId: string,
  input: CreateRecordInput,
  now: ISODateTime,
): RecordMaterial[] {
  return (input.materials ?? []).map((material) => {
    if (material.type === "PHOTO") {
      const mediaId = material.mediaId.trim();
      if (!mediaId) {
        throw new RepositoryError(
          "VALIDATION",
          "Photo material을 확인해 주세요.",
          [{ field: "materials", message: "Photo에는 mediaId가 필요합니다." }],
        );
      }
      return {
        id: uniqueId("record-material"),
        recordId,
        type: material.type,
        mediaId,
        url: null,
        label: material.label?.trim() || null,
        createdAt: now,
      };
    }

    const url = material.url.trim();
    try {
      new URL(url);
    } catch {
      throw new RepositoryError(
        "VALIDATION",
        "Material URL을 확인해 주세요.",
        [{ field: "materials", message: "Link와 Reference에는 올바른 URL이 필요합니다." }],
      );
    }
    return {
      id: uniqueId("record-material"),
      recordId,
      type: material.type,
      mediaId: null,
      url,
      label: material.label?.trim() || null,
      createdAt: now,
    };
  });
}

function nextGatheringNumber(programs: readonly Program[]): number {
  return (
    Math.max(
      0,
      ...programs.map((program) => {
        const match = program.code.match(/(\d+)$/);
        return match ? Number(match[1]) : 0;
      }),
    ) + 1
  );
}

function createGatheringProgram(
  input: CreateGatheringInput,
  hostId: string,
  status: ProgramStatus,
  programs: readonly Program[],
  now: ISODateTime,
): GatheringProgram {
  const sequence = nextGatheringNumber(programs);
  const suffix = String(sequence).padStart(3, "0");
  const programId = uniqueId(`program-gathering-${suffix}`);
  return {
    id: programId,
    code: `OA / G${suffix}`,
    type: "GATHERING",
    title: input.title.trim(),
    description: input.description.trim(),
    hostId,
    startAt: input.startAt,
    endAt: input.endAt,
    location: input.location.trim(),
    mapUrl: input.mapUrl,
    capacity: input.capacity,
    status,
    coverImageId: null,
    createdAt: now,
    updatedAt: now,
    detail: {
      programId,
      category: input.category,
      meetingPoint: input.meetingPoint,
      recruitmentDeadline: input.recruitmentDeadline,
      waitlistEnabled: input.waitlistEnabled,
      cost: clone(input.cost),
      bringItems: input.bringItems,
      notice: input.notice,
    },
  };
}

function applyGatheringInput(
  existing: GatheringProgram,
  input: CreateGatheringInput,
  now: ISODateTime,
): GatheringProgram {
  return {
    ...existing,
    title: input.title.trim(),
    description: input.description.trim(),
    startAt: input.startAt,
    endAt: input.endAt,
    location: input.location.trim(),
    mapUrl: input.mapUrl,
    capacity: input.capacity,
    updatedAt: now,
    detail: {
      programId: existing.id,
      category: input.category,
      meetingPoint: input.meetingPoint,
      recruitmentDeadline: input.recruitmentDeadline,
      waitlistEnabled: input.waitlistEnabled,
      cost: clone(input.cost),
      bringItems: input.bringItems,
      notice: input.notice,
    },
  };
}

export function hasApprovalSensitiveGatheringChanges(
  existing: GatheringProgram,
  input: CreateGatheringInput,
): boolean {
  return hasMaterialGatheringChanges(existing, input);
}

function buildApprovalSnapshotFromState(
  state: MockRepositoryState,
  program: Program,
  approval: ProgramApproval,
  now: ISODateTime,
): ProgramApprovalSnapshot {
  const revision = state.programRevisions.find(
    (candidate) =>
      candidate.programId === program.id && candidate.approvalId === approval.id,
  ) ?? null;
  const snapshotProgram = revision?.proposedProgram ?? program;
  return {
    approval: clone(approval),
    snapshot: clone(
      buildProgramSnapshot(
        snapshotProgram,
        state.users,
        state.participations,
        state.records,
        now,
      ),
    ),
    revision: revision ? clone(revision) : null,
  };
}

export class BrowserMockRepository implements OARepository {
  private readonly storageKey: string;
  private readonly initialState: MockRepositoryState;
  private readonly serverSnapshot: MockRepositoryState;
  private readonly listeners = new Set<Listener>();
  private readonly reactionListeners = new Map<
    string,
    Set<MessageReactionChangeListener>
  >();
  private state: MockRepositoryState;

  constructor(options: BrowserMockRepositoryOptions = {}) {
    this.storageKey = options.storageKey ?? MOCK_REPOSITORY_STORAGE_KEY;
    this.initialState = deepFreeze(clone(options.initialState ?? createMockRepositoryState()));
    this.serverSnapshot = deepFreeze(clone(this.initialState));
    this.state = deepFreeze(this.readPersistedState() ?? clone(this.initialState));

    if (typeof window !== "undefined") {
      window.addEventListener("storage", (event) => {
        if (event.key !== this.storageKey || event.newValue === null) return;
        try {
          const parsed: unknown = JSON.parse(event.newValue);
          if (isMockState(parsed)) {
            this.state = deepFreeze(parsed);
            this.emit();
          }
        } catch {
          // Ignore corrupt values from another tab and retain the last valid state.
        }
      });
    }
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): Readonly<MockRepositoryState> => this.state;
  getSnapshot = (): Readonly<MockRepositoryState> => this.state;
  getServerSnapshot = (): Readonly<MockRepositoryState> => this.serverSnapshot;

  reset = (): void => {
    this.state = deepFreeze(clone(this.initialState));
    this.persist();
    this.emit();
  };

  async listPrograms(
    filter: ProgramFilter = {},
    now: ISODateTime = new Date().toISOString(),
  ): Promise<ProgramSnapshot[]> {
    return clone(
      selectPrograms(
        this.state.programs,
        this.state.users,
        this.state.participations,
        this.state.records,
        filter,
        now,
      ),
    );
  }

  async getProgramById(
    programId: string,
    viewerId: string | null = null,
  ): Promise<Program | null> {
    const program = this.state.programs.find((candidate) => candidate.id === programId);
    if (!program) return null;
    const viewer =
      viewerId === null
        ? null
        : (this.state.users.find((user) => user.id === viewerId) ?? null);
    return canViewDraftProgram(viewer, program) ? clone(program) : null;
  }

  async getProgramSnapshotById(
    programId: string,
    now: ISODateTime = new Date().toISOString(),
    viewerId: string | null = null,
  ): Promise<ProgramSnapshot | null> {
    const program = this.state.programs.find((candidate) => candidate.id === programId);
    const viewer =
      viewerId === null
        ? null
        : (this.state.users.find((user) => user.id === viewerId) ?? null);
    return program && canViewDraftProgram(viewer, program)
      ? clone(
          buildProgramSnapshot(
            program,
            this.state.users,
            this.state.participations,
            this.state.records,
            now,
          ),
        )
      : null;
  }

  async getHomeData(
    now: ISODateTime = new Date().toISOString(),
  ): Promise<HomeData> {
    return clone(
      selectHomeData(
        this.state.programs,
        this.state.users,
        this.state.participations,
        this.state.records,
        now,
      ),
    );
  }

  async listMyActions(
    userId: string,
    _now: ISODateTime = new Date().toISOString(),
  ): Promise<HomeAction[]> {
    void _now; // Kept in the adapter contract for future time-bound action types.
    const user = this.state.users.find((candidate) => candidate.id === userId) ?? null;
    if (!isActiveUser(user)) {
      throw new RepositoryError(
        "UNAUTHORIZED",
        "활성 Member만 자신의 할 일을 확인할 수 있습니다.",
      );
    }

    const actions: HomeAction[] = [];
    for (const approval of this.state.approvals) {
      if (
        approval.requesterId !== userId ||
        approval.status !== "CHANGES_REQUESTED"
      ) {
        continue;
      }
      const program = this.state.programs.find(
        (candidate) => candidate.id === approval.programId,
      );
      if (!program) continue;
      actions.push({
        type: "CHANGES_REQUESTED",
        programId: program.id,
        programTitle: program.title,
        description:
          approval.reviewComment ?? "운영진의 수정 요청을 확인해 주세요.",
        createdAt: approval.reviewedAt ?? approval.requestedAt ?? program.updatedAt,
      });
    }

    for (const program of this.state.programs) {
      if (
        program.hostId === userId &&
        program.status === "COMPLETED" &&
        !this.state.records.some((record) => record.programId === program.id)
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

    for (const participation of this.state.participations) {
      if (
        participation.userId !== userId ||
        participation.status !== "CONFIRMED" ||
        participation.paymentStatus !== "PENDING"
      ) {
        continue;
      }
      const program = this.state.programs.find(
        (candidate) => candidate.id === participation.programId,
      );
      if (
        !program ||
        !["OPEN", "CLOSED"].includes(program.status) ||
        program.type !== "GATHERING" ||
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
    return clone(
      actions.sort(
        (left, right) =>
          priority[left.type] - priority[right.type] ||
          Date.parse(right.createdAt) - Date.parse(left.createdAt),
      ),
    );
  }

  async listCalendarPrograms(
    from: ISODateTime,
    to: ISODateTime,
    now: ISODateTime = new Date().toISOString(),
    scope: CalendarScope = "ALL",
    viewerId: string | null = null,
  ): Promise<ProgramSnapshot[]> {
    const viewer =
      viewerId === null
        ? null
        : (this.state.users.find((user) => user.id === viewerId) ?? null);
    return clone(
      selectCalendarPrograms(
        this.state.programs,
        this.state.users,
        this.state.participations,
        this.state.records,
        from,
        to,
        now,
        scope,
        isActiveUser(viewer) ? viewer.id : null,
      ),
    );
  }

  async submitGatheringForApproval(
    input: CreateGatheringInput,
    requesterId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<ProgramApprovalSnapshot> {
    const requester =
      this.state.users.find((user) => user.id === requesterId) ?? null;
    if (!canSubmitGatheringProposal(requester)) {
      throw new RepositoryError(
        "UNAUTHORIZED",
        "활성 Member만 Gathering을 제안할 수 있습니다.",
      );
    }
    const validation = validateCreateGatheringInput(input);
    if (!validation.success) {
      throw new RepositoryError("VALIDATION", "모임 정보를 확인해 주세요.", validation.issues);
    }

    const program = createGatheringProgram(
      input,
      requesterId,
      "DRAFT",
      this.state.programs,
      now,
    );
    const approval: ProgramApproval = {
      id: uniqueId("approval"),
      programId: program.id,
      requesterId,
      reviewerId: null,
      status: "PENDING",
      requestedAt: now,
      reviewedAt: null,
      reviewComment: null,
      publishedAt: null,
    };
    const next = clone(this.state);
    next.programs.push(program);
    next.approvals.push(approval);
    appendProgramActivity(next, program.id, requesterId, "CREATED", now, {
      source: "MEMBER_PROPOSAL",
    });
    appendProgramActivity(next, program.id, requesterId, "SUBMITTED", now, {
      approvalId: approval.id,
    });
    this.commit(next);
    return buildApprovalSnapshotFromState(next, program, approval, now);
  }

  async resubmitGatheringForApproval(
    programId: string,
    input: CreateGatheringInput,
    requesterId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<ProgramApprovalSnapshot> {
    const programIndex = this.state.programs.findIndex(
      (program) => program.id === programId,
    );
    const existing = this.state.programs[programIndex];
    const approvalIndex = this.state.approvals.findIndex(
      (approval) => approval.programId === programId,
    );
    const currentApproval = this.state.approvals[approvalIndex];
    if (!existing || existing.type !== "GATHERING" || !currentApproval) {
      throw new RepositoryError("NOT_FOUND", "제안한 Gathering을 찾을 수 없습니다.");
    }
    const requester =
      this.state.users.find((user) => user.id === requesterId) ?? null;
    if (
      !canSubmitGatheringProposal(requester) ||
      currentApproval.requesterId !== requesterId ||
      existing.hostId !== requesterId
    ) {
      throw new RepositoryError("FORBIDDEN", "이 제안을 다시 제출할 권한이 없습니다.");
    }
    if (
      !(
        currentApproval.status === "CHANGES_REQUESTED" &&
        this.state.programRevisions.some(
          (revision) => revision.approvalId === currentApproval.id,
        )
      ) &&
      !capabilitiesForState(this.state, existing, requesterId, now)
        .canSubmitForApproval
    ) {
      throw new RepositoryError(
        "INVALID_TRANSITION",
        "현재 상태의 제안은 제출할 수 없습니다.",
      );
    }
    const validation = validateCreateGatheringInput(input);
    if (!validation.success) {
      throw new RepositoryError("VALIDATION", "모임 정보를 확인해 주세요.", validation.issues);
    }

    const approval: ProgramApproval = {
      ...currentApproval,
      reviewerId: null,
      status: "PENDING",
      requestedAt: now,
      reviewedAt: null,
      reviewComment: null,
    };
    const next = clone(this.state);
    next.approvals[approvalIndex] = approval;
    const revisionIndex = next.programRevisions.findIndex(
      (revision) => revision.approvalId === approval.id,
    );
    let snapshotProgram: GatheringProgram;
    if (revisionIndex >= 0) {
      const currentRevision = next.programRevisions[revisionIndex];
      const changePolicy = classifyGatheringChanges(existing, input);
      const proposedProgram: GatheringProgram = {
        ...applyGatheringInput(existing, input, now),
        status: existing.status,
      };
      next.programRevisions[revisionIndex] = {
        ...currentRevision,
        proposedProgram,
        changedFields: changePolicy.changedFields,
        updatedAt: now,
      };
      snapshotProgram = proposedProgram;
    } else {
      const proposedProgram: GatheringProgram = {
        ...applyGatheringInput(existing, input, now),
        status: "DRAFT",
      };
      next.programs[programIndex] = proposedProgram;
      snapshotProgram = proposedProgram;
    }
    appendProgramActivity(next, existing.id, requesterId, "SUBMITTED", now, {
      approvalId: approval.id,
      resubmission: true,
      revision: revisionIndex >= 0,
    });
    this.commit(next);
    return buildApprovalSnapshotFromState(next, snapshotProgram, approval, now);
  }

  async publishGathering(
    input: CreateGatheringInput,
    adminId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<GatheringProgram> {
    const admin = this.state.users.find((user) => user.id === adminId) ?? null;
    if (!canPublishProgramDirectly(admin)) {
      throw new RepositoryError(
        "FORBIDDEN",
        "Admin만 승인 없이 Gathering을 게시할 수 있습니다.",
      );
    }
    const validation = validateCreateGatheringInput(input);
    if (!validation.success) {
      throw new RepositoryError("VALIDATION", "모임 정보를 확인해 주세요.", validation.issues);
    }

    const program = createGatheringProgram(
      input,
      adminId,
      "OPEN",
      this.state.programs,
      now,
    );
    const approval: ProgramApproval = {
      id: uniqueId("approval"),
      programId: program.id,
      requesterId: adminId,
      reviewerId: null,
      status: "NOT_REQUIRED",
      requestedAt: null,
      reviewedAt: null,
      reviewComment: null,
      publishedAt: now,
    };
    const next = clone(this.state);
    next.programs.push(program);
    next.approvals.push(approval);
    appendProgramActivity(next, program.id, adminId, "CREATED", now, {
      source: "ADMIN_DIRECT",
    });
    this.commit(next);
    return clone(program);
  }

  async updateGathering(
    programId: string,
    input: CreateGatheringInput,
    actorId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<GatheringProgram> {
    const index = this.state.programs.findIndex((program) => program.id === programId);
    const existing = this.state.programs[index];
    if (!existing || existing.type !== "GATHERING") {
      throw new RepositoryError("NOT_FOUND", "모임을 찾을 수 없습니다.");
    }
    const validation = validateCreateGatheringInput(input);
    if (!validation.success) {
      throw new RepositoryError("VALIDATION", "모임 정보를 확인해 주세요.", validation.issues);
    }
    const approval = this.state.approvals.find(
      (candidate) => candidate.programId === programId,
    );
    if (!approval) {
      throw new RepositoryError(
        "APPROVAL_REQUIRED",
        "승인 정보가 없는 Gathering은 수정할 수 없습니다.",
      );
    }
    const capabilities = capabilitiesForState(
      this.state,
      existing,
      actorId,
      now,
    );
    if (!capabilities.canEditProgram) {
      throw new RepositoryError("FORBIDDEN", "이 모임을 수정할 권한이 없습니다.");
    }
    if (approval.status === "PENDING") {
      throw new RepositoryError(
        "INVALID_TRANSITION",
        "검토 중인 제안은 수정할 수 없습니다.",
      );
    }
    if (approval.status === "CHANGES_REQUESTED") {
      throw new RepositoryError(
        "INVALID_TRANSITION",
        "수정 요청 제안은 다시 제출 흐름을 이용해 주세요.",
      );
    }
    if (approval.status === "REJECTED") {
      throw new RepositoryError(
        "INVALID_TRANSITION",
        "거절된 제안은 수정할 수 없습니다.",
      );
    }
    const changePolicy = classifyGatheringChanges(existing, input);
    if (changePolicy.classification === "NONE") return clone(existing);
    const materialChange =
      approval.status === "APPROVED" && changePolicy.requiresReapproval;
    const proposedProgram: GatheringProgram = {
      ...applyGatheringInput(existing, input, now),
      status: existing.status,
    };
    const next = clone(this.state);
    if (materialChange) {
      const approvalIndex = next.approvals.findIndex(
        (candidate) => candidate.id === approval.id,
      );
      next.approvals[approvalIndex] = {
        ...approval,
        reviewerId: null,
        status: "PENDING",
        requestedAt: now,
        reviewedAt: null,
        reviewComment: null,
      };
      const revision: GatheringProgramRevision = {
        id: uniqueId("program-revision"),
        programId,
        approvalId: approval.id,
        proposedBy: actorId,
        proposedProgram,
        changedFields: [...changePolicy.changedFields],
        createdAt: now,
        updatedAt: now,
      };
      const revisionIndex = next.programRevisions.findIndex(
        (candidate) => candidate.programId === programId,
      );
      if (revisionIndex >= 0) next.programRevisions[revisionIndex] = revision;
      else next.programRevisions.push(revision);
    } else {
      next.programs[index] = proposedProgram;
    }
    appendProgramActivity(next, programId, actorId, "UPDATED", now, {
      classification: changePolicy.classification,
      changedFields: changePolicy.changedFields,
      applied: !materialChange,
    });
    if (materialChange) {
      appendProgramActivity(next, programId, actorId, "SUBMITTED", now, {
        approvalId: approval.id,
        reason: "MATERIAL_CHANGE",
        changedFields: changePolicy.materialFields,
      });
    }
    this.commit(next);
    return clone(materialChange ? existing : proposedProgram);
  }

  async setProgramStatus(
    programId: string,
    status: ProgramStatus,
    actorId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<Program> {
    const index = this.state.programs.findIndex((program) => program.id === programId);
    const program = this.state.programs[index];
    if (!program) throw new RepositoryError("NOT_FOUND", "프로그램을 찾을 수 없습니다.");
    const actor = this.state.users.find((user) => user.id === actorId) ?? null;
    if (!canManageProgram(actor, program)) {
      throw new RepositoryError("FORBIDDEN", "프로그램을 운영할 권한이 없습니다.");
    }
    if (program.status === status) return clone(program);
    if (!PROGRAM_STATUS_TRANSITIONS[program.status].includes(status)) {
      throw new RepositoryError(
        "INVALID_TRANSITION",
        `${program.status} Program을 ${status}(으)로 변경할 수 없습니다.`,
      );
    }
    const approval = this.state.approvals.find(
      (candidate) => candidate.programId === programId,
    );
    const capabilities = capabilitiesForState(
      this.state,
      program,
      actorId,
      now,
    );
    if (status === "CLOSED" && !capabilities.canCloseRecruitment) {
      throw new RepositoryError(
        "FORBIDDEN",
        "현재 Program의 모집을 마감할 권한이 없습니다.",
      );
    }
    if (status === "CANCELLED" && !capabilities.canCancelProgram) {
      throw new RepositoryError(
        "FORBIDDEN",
        "현재 Program을 취소할 권한이 없습니다.",
      );
    }
    if (
      status !== "CLOSED" &&
      status !== "CANCELLED" &&
      actor?.status !== "ADMIN"
    ) {
      throw new RepositoryError(
        "FORBIDDEN",
        "호스트는 모집 마감 또는 취소만 처리할 수 있습니다.",
      );
    }
    if (status === "OPEN") {
      if (actor?.status !== "ADMIN") {
        throw new RepositoryError(
          "FORBIDDEN",
          "Program 공개는 Admin 승인으로만 처리할 수 있습니다.",
        );
      }
      if (
        !approval ||
        !["APPROVED", "NOT_REQUIRED"].includes(approval.status)
      ) {
        throw new RepositoryError(
          "APPROVAL_REQUIRED",
          "승인되지 않은 Program은 OPEN으로 변경할 수 없습니다.",
        );
      }
    }
    const updated: Program = { ...program, status, updatedAt: now };
    const next = clone(this.state);
    next.programs[index] = updated;
    if (status === "COMPLETED") {
      appendProgramActivity(next, programId, actorId, "COMPLETED", now, {
        previousStatus: program.status,
      });
    }
    this.commit(next);
    return clone(updated);
  }

  async listHostedPrograms(
    userId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<ProgramSnapshot[]> {
    return clone(
      selectHostedPrograms(
        this.state.programs,
        this.state.users,
        this.state.participations,
        this.state.records,
        userId,
        now,
      ),
    );
  }

  async getProgramApproval(
    programId: string,
    viewerId: string,
  ): Promise<ProgramApproval | null> {
    const program = this.state.programs.find(
      (candidate) => candidate.id === programId,
    );
    const approval = this.state.approvals.find(
      (candidate) => candidate.programId === programId,
    );
    if (!program || !approval) return null;
    const viewer =
      this.state.users.find((user) => user.id === viewerId) ?? null;
    return canViewProgramApproval(viewer, program, approval)
      ? clone(approval)
      : null;
  }

  async getGatheringRevision(
    programId: string,
    viewerId: string,
  ): Promise<GatheringProgramRevision | null> {
    const program = this.state.programs.find(
      (candidate) => candidate.id === programId,
    );
    const approval = this.state.approvals.find(
      (candidate) => candidate.programId === programId,
    );
    if (!program || !approval) return null;
    const viewer = this.state.users.find((user) => user.id === viewerId) ?? null;
    if (!canViewProgramApproval(viewer, program, approval)) {
      throw new RepositoryError(
        "FORBIDDEN",
        "이 Program revision을 확인할 권한이 없습니다.",
      );
    }
    const revision = this.state.programRevisions.find(
      (candidate) =>
        candidate.programId === programId && candidate.approvalId === approval.id,
    );
    return revision ? clone(revision) : null;
  }

  async listMyProposals(
    requesterId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<ProgramApprovalSnapshot[]> {
    const requester =
      this.state.users.find((user) => user.id === requesterId) ?? null;
    if (!isActiveUser(requester)) {
      throw new RepositoryError(
        "UNAUTHORIZED",
        "활성 Member만 자신의 제안을 확인할 수 있습니다.",
      );
    }
    const proposals = selectMyProposals(
        this.state.programs,
        this.state.approvals,
        this.state.users,
        this.state.participations,
        this.state.records,
        requesterId,
        now,
      );
    return proposals.map(({ approval, snapshot }) =>
      buildApprovalSnapshotFromState(
        this.state,
        snapshot.program,
        approval,
        now,
      ),
    );
  }

  async listApprovalQueue(
    reviewerId: string,
    statuses: readonly ApprovalStatus[] = ["PENDING"],
    now: ISODateTime = new Date().toISOString(),
  ): Promise<ProgramApprovalSnapshot[]> {
    const reviewer =
      this.state.users.find((user) => user.id === reviewerId) ?? null;
    if (!canReviewProgramApproval(reviewer)) {
      throw new RepositoryError(
        "FORBIDDEN",
        "Admin만 승인 요청을 확인할 수 있습니다.",
      );
    }
    const queue = selectApprovalQueue(
        this.state.programs,
        this.state.approvals,
        this.state.users,
        this.state.participations,
        this.state.records,
        statuses,
        now,
      );
    return queue.map(({ approval, snapshot }) =>
      buildApprovalSnapshotFromState(
        this.state,
        snapshot.program,
        approval,
        now,
      ),
    );
  }

  async reviewProgramApproval(
    programId: string,
    decision: ProgramApprovalDecision,
    reviewerId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<ProgramApprovalSnapshot> {
    const reviewer =
      this.state.users.find((user) => user.id === reviewerId) ?? null;
    if (!canReviewProgramApproval(reviewer)) {
      throw new RepositoryError(
        "FORBIDDEN",
        "Admin만 승인 요청을 검토할 수 있습니다.",
      );
    }
    const programIndex = this.state.programs.findIndex(
      (candidate) => candidate.id === programId,
    );
    const approvalIndex = this.state.approvals.findIndex(
      (candidate) => candidate.programId === programId,
    );
    const existingProgram = this.state.programs[programIndex];
    const existingApproval = this.state.approvals[approvalIndex];
    if (!existingProgram || !existingApproval) {
      throw new RepositoryError("NOT_FOUND", "승인 요청을 찾을 수 없습니다.");
    }
    if (
      !capabilitiesForState(
        this.state,
        existingProgram,
        reviewerId,
        now,
      ).canReviewApproval
    ) {
      throw new RepositoryError(
        "INVALID_TRANSITION",
        "검토 대기 중인 제안만 처리할 수 있습니다.",
      );
    }
    const comment = decision.comment?.trim() || null;
    if (decision.status === "CHANGES_REQUESTED" && comment === null) {
      throw new RepositoryError(
        "VALIDATION",
        "수정 요청에는 운영진 코멘트가 필요합니다.",
        [{ field: "reviewComment", message: "수정 요청 내용을 입력해 주세요." }],
      );
    }

    const revisionIndex = this.state.programRevisions.findIndex(
      (candidate) =>
        candidate.programId === programId &&
        candidate.approvalId === existingApproval.id,
    );
    const revision = this.state.programRevisions[revisionIndex] ?? null;
    const approval: ProgramApproval = {
      ...existingApproval,
      reviewerId,
      status: decision.status,
      reviewedAt: now,
      reviewComment: comment,
      publishedAt:
        decision.status === "APPROVED"
          ? now
          : (existingApproval.publishedAt ?? null),
    };
    const program: Program = revision
      ? decision.status === "APPROVED"
        ? {
            ...revision.proposedProgram,
            status: existingProgram.status,
            updatedAt: now,
          }
        : existingProgram
      : {
          ...existingProgram,
          status: decision.status === "APPROVED" ? "OPEN" : "DRAFT",
          updatedAt: now,
        };
    const next = clone(this.state);
    next.approvals[approvalIndex] = approval;
    next.programs[programIndex] = program;
    if (revision && decision.status === "APPROVED") {
      next.programRevisions.splice(revisionIndex, 1);
    }
    appendProgramActivity(
      next,
      programId,
      reviewerId,
      decision.status,
      now,
      {
        approvalId: approval.id,
        reviewComment: comment,
      },
    );
    this.commit(next);
    return buildApprovalSnapshotFromState(next, program, approval, now);
  }

  async getHostDashboard(
    programId: string,
    viewerId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<HostDashboard> {
    const program = this.state.programs.find((candidate) => candidate.id === programId);
    if (!program) throw new RepositoryError("NOT_FOUND", "프로그램을 찾을 수 없습니다.");
    const viewer = this.state.users.find((user) => user.id === viewerId) ?? null;
    if (!canViewParticipantPayment(viewer, program)) {
      throw new RepositoryError("FORBIDDEN", "운영 정보에 접근할 권한이 없습니다.");
    }
    const programParticipations = this.state.participations.filter(
      (candidate) => candidate.programId === programId,
    );
    const participants = programParticipations.flatMap((candidate) => {
      const user = this.state.users.find((entry) => entry.id === candidate.userId);
      return user ? [{ participation: clone(candidate), user: clone(user) }] : [];
    });
    const dashboard: HostDashboard = {
      snapshot: buildProgramSnapshot(
        program,
        this.state.users,
        this.state.participations,
        this.state.records,
        now,
      ),
      participants,
      payment: {
        paid: programParticipations.filter(
          (candidate) =>
            candidate.status === "CONFIRMED" && candidate.paymentStatus === "PAID",
        ).length,
        pending: programParticipations.filter(
          (candidate) =>
            candidate.status === "CONFIRMED" && candidate.paymentStatus === "PENDING",
        ).length,
      },
    };
    return clone(dashboard);
  }

  async joinProgram(
    programId: string,
    userId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<JoinOutcome> {
    const program = this.state.programs.find((candidate) => candidate.id === programId);
    if (!program) throw new RepositoryError("NOT_FOUND", "프로그램을 찾을 수 없습니다.");
    const user = this.state.users.find((candidate) => candidate.id === userId) ?? null;
    if (!isActiveUser(user)) {
      throw new RepositoryError("UNAUTHORIZED", "활성 회원만 참여할 수 있습니다.");
    }
    if (program.hostId === userId) {
      throw new RepositoryError("FORBIDDEN", "호스트는 별도로 참여 신청하지 않습니다.");
    }
    if (program.status !== "OPEN") {
      throw new RepositoryError("NOT_OPEN", "현재 모집 중인 프로그램이 아닙니다.");
    }
    if (Date.parse(program.startAt) <= Date.parse(now)) {
      throw new RepositoryError("RECRUITMENT_CLOSED", "이미 시작된 프로그램입니다.");
    }
    if (
      program.type === "GATHERING" &&
      program.detail.recruitmentDeadline !== null &&
      Date.parse(program.detail.recruitmentDeadline) < Date.parse(now)
    ) {
      throw new RepositoryError("RECRUITMENT_CLOSED", "모집이 마감되었습니다.");
    }
    const existing = this.state.participations.find(
      (candidate) =>
        candidate.programId === programId &&
        candidate.userId === userId,
    );
    if (existing && existing.status !== "CANCELLED") {
      throw new RepositoryError("ALREADY_JOINED", "이미 참여 중인 프로그램입니다.");
    }
    const confirmedCount = this.state.participations.filter(
      (candidate) =>
        candidate.programId === programId && candidate.status === "CONFIRMED",
    ).length;
    const hasCapacity = program.capacity === null || confirmedCount < program.capacity;
    const waitlistEnabled = program.type === "GATHERING" && program.detail.waitlistEnabled;
    if (!hasCapacity && !waitlistEnabled) {
      throw new RepositoryError("CAPACITY_FULL", "모집 정원이 마감되었습니다.");
    }
    if (!capabilitiesForState(this.state, program, userId, now).canJoin) {
      throw new RepositoryError(
        "FORBIDDEN",
        "현재 사용자 또는 승인 상태에서는 이 Program에 참여할 수 없습니다.",
      );
    }
    const placement: JoinOutcome["placement"] = hasCapacity ? "CONFIRMED" : "WAITLIST";
    const paymentStatus: PaymentStatus =
      placement === "CONFIRMED" &&
      program.type === "GATHERING" &&
      program.detail.cost.type === "HOST_COLLECT"
        ? "PENDING"
        : "NOT_REQUIRED";
    const created: Participation = {
      id: existing?.id ?? uniqueId("participation"),
      programId,
      userId,
      status: placement,
      paymentStatus,
      joinedAt: now,
    };
    const next = clone(this.state);
    if (existing) {
      const existingIndex = next.participations.findIndex((item) => item.id === existing.id);
      next.participations[existingIndex] = created;
    } else {
      next.participations.push(created);
    }
    appendProgramActivity(
      next,
      programId,
      userId,
      placement === "CONFIRMED" ? "JOINED" : "WAITLISTED",
      now,
      { participationId: created.id },
    );
    this.commit(next);
    return { participation: clone(created), placement };
  }

  async cancelParticipation(
    programId: string,
    userId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<Participation> {
    const program = this.state.programs.find(
      (candidate) => candidate.id === programId,
    );
    if (!program) {
      throw new RepositoryError("NOT_FOUND", "프로그램을 찾을 수 없습니다.");
    }
    const participationIndex = this.state.participations.findIndex(
      (candidate) =>
        candidate.programId === programId && candidate.userId === userId,
    );
    const participation = this.state.participations[participationIndex];
    if (!participation) {
      throw new RepositoryError("NOT_FOUND", "취소할 참여 정보를 찾을 수 없습니다.");
    }
    if (participation.status === "CANCELLED") return clone(participation);

    const capabilities = capabilitiesForState(
      this.state,
      program,
      userId,
      now,
    );
    if (!capabilities.canCancelParticipation) {
      throw new RepositoryError(
        "FORBIDDEN",
        "현재 상태에서는 참여를 취소할 수 없습니다.",
      );
    }

    const cancelled: Participation = {
      ...participation,
      status: "CANCELLED",
    };
    const next = clone(this.state);
    next.participations[participationIndex] = cancelled;
    appendProgramActivity(next, programId, userId, "LEFT", now, {
      participationId: participation.id,
      previousStatus: participation.status,
    });
    this.commit(next);
    return clone(cancelled);
  }

  async getParticipation(
    programId: string,
    userId: string,
  ): Promise<Participation | null> {
    const result = this.state.participations.find(
      (candidate) => candidate.programId === programId && candidate.userId === userId,
    );
    return result ? clone(result) : null;
  }

  async listParticipationsForProgram(programId: string): Promise<Participation[]> {
    return clone(
      this.state.participations.filter(
        (candidate) => candidate.programId === programId,
      ),
    );
  }

  async listMyUpcoming(
    userId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<ProgramSnapshot[]> {
    return clone(
      selectMyUpcoming(
        this.state.programs,
        this.state.users,
        this.state.participations,
        this.state.records,
        userId,
        now,
      ),
    );
  }

  async confirmParticipationPayment(
    participationId: string,
    actorId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<Participation> {
    const participationIndex = this.state.participations.findIndex(
      (candidate) => candidate.id === participationId,
    );
    const participation = this.state.participations[participationIndex];
    if (!participation) {
      throw new RepositoryError("NOT_FOUND", "참여 정보를 찾을 수 없습니다.");
    }
    const program = this.state.programs.find(
      (candidate) => candidate.id === participation.programId,
    );
    if (!program) {
      throw new RepositoryError("NOT_FOUND", "프로그램을 찾을 수 없습니다.");
    }
    const capabilities = capabilitiesForState(
      this.state,
      program,
      actorId,
      now,
    );
    if (!capabilities.canManagePayments) {
      throw new RepositoryError("FORBIDDEN", "납부 상태를 변경할 권한이 없습니다.");
    }
    if (
      program.type !== "GATHERING" ||
      program.detail.cost.type !== "HOST_COLLECT" ||
      participation.status !== "CONFIRMED" ||
      participation.paymentStatus === "NOT_REQUIRED"
    ) {
      throw new RepositoryError(
        "INVALID_TRANSITION",
        "수납 대상인 확정 참가자만 납부 확인할 수 있습니다.",
      );
    }
    if (participation.paymentStatus === "PAID") return clone(participation);

    const updated: Participation = { ...participation, paymentStatus: "PAID" };
    const next = clone(this.state);
    next.participations[participationIndex] = updated;
    appendProgramActivity(
      next,
      program.id,
      actorId,
      "PAYMENT_CONFIRMED",
      now,
      {
        participationId: participation.id,
        participantId: participation.userId,
      },
    );
    this.commit(next);
    return clone(updated);
  }

  async getPageContent(key: PageContentKey): Promise<PageContent | null> {
    const content = this.state.pageContents.find(
      (candidate) => candidate.key === key,
    );
    return content ? clone(content) : null;
  }

  async listPageContents(): Promise<PageContent[]> {
    return clone(this.state.pageContents);
  }

  async updatePageContent(
    key: PageContentKey,
    input: UpdatePageContentInput,
    adminId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<PageContent> {
    const admin = this.state.users.find((user) => user.id === adminId) ?? null;
    if (!canPublishProgramDirectly(admin)) {
      throw new RepositoryError(
        "FORBIDDEN",
        "Admin만 페이지 콘텐츠를 수정할 수 있습니다.",
      );
    }
    const index = this.state.pageContents.findIndex(
      (candidate) => candidate.key === key,
    );
    const existing = this.state.pageContents[index];
    if (!existing) {
      throw new RepositoryError("NOT_FOUND", "페이지 콘텐츠를 찾을 수 없습니다.");
    }
    if (!input.title.trim()) {
      throw new RepositoryError(
        "VALIDATION",
        "표시 제목을 입력해 주세요.",
        [{ field: "title", message: "표시 제목이 필요합니다." }],
      );
    }
    const updated: PageContent = {
      ...existing,
      title: input.title.trim(),
      headline: input.headline.trim(),
      description: input.description.trim(),
      emptyState: input.emptyState.trim(),
      updatedAt: now,
      updatedBy: adminId,
    };
    const next = clone(this.state);
    next.pageContents[index] = updated;
    this.commit(next);
    return clone(updated);
  }

  async getRecordByProgramId(programId: string): Promise<ProgramRecord | null> {
    const record = this.state.records.find((candidate) => candidate.programId === programId);
    return record ? clone(record) : null;
  }

  async listRecords(): Promise<ProgramRecord[]> {
    return clone(this.state.records);
  }

  async getRecordSnapshotByProgramId(
    programId: string,
  ): Promise<ProgramRecordSnapshot | null> {
    const record = this.state.records.find(
      (candidate) => candidate.programId === programId,
    );
    return record ? buildRecordSnapshotFromState(this.state, record) : null;
  }

  async createRecord(
    programId: string,
    input: CreateRecordInput,
    authorId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<ProgramRecordSnapshot> {
    const program = this.state.programs.find(
      (candidate) => candidate.id === programId,
    );
    if (!program) {
      throw new RepositoryError("NOT_FOUND", "프로그램을 찾을 수 없습니다.");
    }
    const capabilities = capabilitiesForState(
      this.state,
      program,
      authorId,
      now,
    );
    if (!capabilities.canWriteRecord) {
      throw new RepositoryError(
        "FORBIDDEN",
        "이 Program의 Record를 작성할 권한이 없습니다.",
      );
    }
    if (this.state.records.some((record) => record.programId === programId)) {
      throw new RepositoryError(
        "INVALID_TRANSITION",
        "이미 Record가 작성된 Program입니다.",
      );
    }
    const what = input.what.trim();
    if (!what) {
      throw new RepositoryError(
        "VALIDATION",
        "WHAT을 입력해 주세요.",
        [{ field: "what", message: "무엇을 했는지 1~3문장으로 남겨 주세요." }],
      );
    }
    const found = input.found?.trim() || null;
    const recordId = uniqueId("record");
    const materials = buildRecordMaterials(recordId, input, now);
    const photo = materials.find((material) => material.type === "PHOTO") ?? null;
    const link = materials.find((material) => material.type === "LINK") ?? null;
    const record: ProgramRecord = {
      id: recordId,
      programId,
      authorId,
      what,
      found,
      summary: what,
      body: found,
      photoMediaId: photo?.mediaId ?? null,
      linkUrl: link?.url ?? null,
      createdAt: now,
    };
    const next = clone(this.state);
    next.records.push(record);
    next.recordMaterials.push(...materials);
    appendProgramActivity(next, programId, authorId, "RECORD_CREATED", now, {
      recordId,
      materialCount: materials.length,
    });
    this.commit(next);
    return buildRecordSnapshotFromState(next, record);
  }

  async updateRecord(
    programId: string,
    input: CreateRecordInput,
    actorId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<ProgramRecordSnapshot> {
    const program = this.state.programs.find(
      (candidate) => candidate.id === programId,
    );
    const recordIndex = this.state.records.findIndex(
      (candidate) => candidate.programId === programId,
    );
    const existing = this.state.records[recordIndex];
    if (!program || !existing) {
      throw new RepositoryError("NOT_FOUND", "수정할 Record를 찾을 수 없습니다.");
    }
    if (!capabilitiesForState(this.state, program, actorId, now).canEditRecord) {
      throw new RepositoryError("FORBIDDEN", "이 Record를 수정할 권한이 없습니다.");
    }

    const what = input.what.trim();
    if (!what) {
      throw new RepositoryError(
        "VALIDATION",
        "WHAT을 입력해 주세요.",
        [{ field: "what", message: "무엇을 했는지 1~3문장으로 남겨 주세요." }],
      );
    }
    const found = input.found?.trim() || null;
    const materials = buildRecordMaterials(existing.id, input, now);
    const photo = materials.find((material) => material.type === "PHOTO") ?? null;
    const link = materials.find((material) => material.type === "LINK") ?? null;
    const updated: ProgramRecord = {
      ...existing,
      what,
      found,
      summary: what,
      body: found,
      photoMediaId: photo?.mediaId ?? null,
      linkUrl: link?.url ?? null,
    };
    const next = clone(this.state);
    next.records[recordIndex] = updated;
    next.recordMaterials = next.recordMaterials.filter(
      (material) => material.recordId !== existing.id,
    );
    next.recordMaterials.push(...materials);
    appendProgramActivity(next, programId, actorId, "UPDATED", now, {
      scope: "RECORD",
      recordId: existing.id,
      materialCount: materials.length,
    });
    this.commit(next);
    return buildRecordSnapshotFromState(next, updated);
  }

  async listProgramActivities(
    programId: string,
    viewerId: string,
  ): Promise<ProgramActivity[]> {
    const program = this.state.programs.find(
      (candidate) => candidate.id === programId,
    );
    if (!program) {
      throw new RepositoryError("NOT_FOUND", "프로그램을 찾을 수 없습니다.");
    }
    const viewer = this.state.users.find((candidate) => candidate.id === viewerId) ?? null;
    if (!canManageProgram(viewer, program)) {
      throw new RepositoryError("FORBIDDEN", "Program 운영 기록을 확인할 권한이 없습니다.");
    }
    return clone(
      this.state.activities
        .filter((activity) => activity.programId === programId)
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
    );
  }

  async listProgramMessages(
    programId: string,
    viewerId: string,
  ): Promise<ProgramMessage[]> {
    const program = this.state.programs.find(
      (candidate) => candidate.id === programId,
    );
    if (!program) {
      throw new RepositoryError("NOT_FOUND", "프로그램을 찾을 수 없습니다.");
    }
    if (!capabilitiesForState(this.state, program, viewerId).canAccessTalk) {
      throw new RepositoryError(
        "FORBIDDEN",
        "이 Program TALK를 읽을 권한이 없습니다.",
      );
    }

    return clone(
      this.state.messages
        .filter(
          (message) => message.programId === programId && !message.isHidden,
        )
        .sort((left, right) => {
          const leftPinned = left.type === "NOTICE" && left.isPinned ? 1 : 0;
          const rightPinned = right.type === "NOTICE" && right.isPinned ? 1 : 0;
          return (
            rightPinned - leftPinned ||
            Date.parse(left.createdAt) - Date.parse(right.createdAt)
          );
        }),
    );
  }

  watchProgramMessages(
    programId: string,
    onReactionChange?: MessageReactionChangeListener,
  ): () => void {
    if (!onReactionChange) return () => undefined;
    const listeners = this.reactionListeners.get(programId) ?? new Set();
    listeners.add(onReactionChange);
    this.reactionListeners.set(programId, listeners);
    return () => {
      listeners.delete(onReactionChange);
      if (listeners.size === 0) this.reactionListeners.delete(programId);
    };
  }

  async postProgramMessage(
    programId: string,
    input: CreateProgramMessageInput,
    authorId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<ProgramMessage> {
    const program = this.state.programs.find(
      (candidate) => candidate.id === programId,
    );
    if (!program) {
      throw new RepositoryError("NOT_FOUND", "프로그램을 찾을 수 없습니다.");
    }
    const author = this.state.users.find((candidate) => candidate.id === authorId) ?? null;
    const participation =
      this.state.participations.find(
        (candidate) =>
          candidate.programId === programId && candidate.userId === authorId,
      ) ?? null;
    const approval =
      this.state.approvals.find((candidate) => candidate.programId === programId) ?? null;
    const record =
      this.state.records.find((candidate) => candidate.programId === programId) ?? null;
    const confirmed = this.state.participations.filter(
      (candidate) =>
        candidate.programId === programId && candidate.status === "CONFIRMED",
    ).length;
    if (
      !canWriteProgramMessage(
        {
          user: author,
          program,
          participation,
          approval,
          record,
          participantCounts: { confirmed },
        },
        input.type,
      )
    ) {
      throw new RepositoryError(
        "FORBIDDEN",
        input.type === "NOTICE"
          ? "Host와 Admin만 Notice를 작성할 수 있습니다."
          : "이 Program TALK에 작성할 권한이 없습니다.",
      );
    }
    const content = input.content.trim();
    if (!content) {
      throw new RepositoryError(
        "VALIDATION",
        "메시지 내용을 입력해 주세요.",
        [{ field: "content", message: "메시지 내용이 필요합니다." }],
      );
    }
    const parentId = input.parentId ?? null;
    if (
      parentId !== null &&
      !this.state.messages.some(
        (message) => message.id === parentId && message.programId === programId,
      )
    ) {
      throw new RepositoryError("NOT_FOUND", "답글 대상 메시지를 찾을 수 없습니다.");
    }
    if (input.isPinned && input.type !== "NOTICE") {
      throw new RepositoryError(
        "VALIDATION",
        "Notice만 상단에 고정할 수 있습니다.",
        [{ field: "isPinned", message: "Notice만 고정할 수 있습니다." }],
      );
    }
    const duplicate = this.state.messages.find(
      (message) =>
        message.programId === programId &&
        message.authorId === authorId &&
        message.type === input.type &&
        message.content === content &&
        message.parentId === parentId &&
        message.createdAt === now,
    );
    if (duplicate) return clone(duplicate);

    const message: ProgramMessage = {
      id: uniqueId("message"),
      programId,
      authorId,
      type: input.type,
      content,
      parentId,
      isPinned: input.type === "NOTICE" && Boolean(input.isPinned),
      isHidden: false,
      createdAt: now,
      editedAt: null,
    };
    const next = clone(this.state);
    next.messages.push(message);
    if (message.type === "NOTICE") {
      appendProgramActivity(next, programId, authorId, "NOTICE_POSTED", now, {
        messageId: message.id,
        isPinned: message.isPinned,
      });
    }
    this.commit(next);
    return clone(message);
  }

  async listProgramMessageReactions(
    programId: string,
    viewerId: string,
    messageIds?: readonly string[],
  ): Promise<MessageReactionSnapshot[]> {
    const program = this.state.programs.find(
      (candidate) => candidate.id === programId,
    );
    if (!program) {
      throw new RepositoryError("NOT_FOUND", "프로그램을 찾을 수 없습니다.");
    }
    if (!capabilitiesForState(this.state, program, viewerId).canAccessTalk) {
      throw new RepositoryError(
        "FORBIDDEN",
        "이 Program TALK의 반응을 읽을 권한이 없습니다.",
      );
    }
    const messageFilter = messageIds ? new Set(messageIds) : null;
    const visibleMessageIds = new Set(
      this.state.messages
        .filter(
          (message) => message.programId === programId && !message.isHidden,
        )
        .map((message) => message.id),
    );
    return clone(
      this.state.messageReactions
        .filter(
          (reaction) =>
            reaction.programId === programId &&
            visibleMessageIds.has(reaction.messageId) &&
            (!messageFilter || messageFilter.has(reaction.messageId)),
        )
        .map((reaction) => {
          const user = this.state.users.find(
            (candidate) => candidate.id === reaction.userId,
          );
          if (!user) {
            throw new RepositoryError(
              "NOT_FOUND",
              "반응을 남긴 Member를 찾을 수 없습니다.",
            );
          }
          return {
            ...reaction,
            user: {
              id: user.id,
              name: user.name,
              imageUrl: user.imageUrl,
              seasons: [
                ...(this.state.participatingSeasonsByUserId[user.id] ?? []),
              ],
            },
          };
        }),
    );
  }

  async toggleProgramMessageReaction(
    programId: string,
    messageId: string,
    emoji: MessageReactionEmoji,
    actorId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<MessageReactionSnapshot | null> {
    if (!isMessageReactionEmoji(emoji)) {
      throw new RepositoryError("VALIDATION", "허용되지 않은 반응입니다.");
    }
    const program = this.state.programs.find(
      (candidate) => candidate.id === programId,
    );
    const message = this.state.messages.find(
      (candidate) =>
        candidate.id === messageId && candidate.programId === programId,
    );
    if (!program || !message) {
      throw new RepositoryError("NOT_FOUND", "메시지를 찾을 수 없습니다.");
    }
    if (message.isHidden) {
      throw new RepositoryError("NOT_FOUND", "메시지를 찾을 수 없습니다.");
    }
    const actor = this.state.users.find((candidate) => candidate.id === actorId) ?? null;
    if (!actor) {
      throw new RepositoryError("UNAUTHORIZED", "로그인이 필요합니다.");
    }
    const participation =
      this.state.participations.find(
        (candidate) =>
          candidate.programId === programId && candidate.userId === actorId,
      ) ?? null;
    const approval =
      this.state.approvals.find((candidate) => candidate.programId === programId) ?? null;
    const record =
      this.state.records.find((candidate) => candidate.programId === programId) ?? null;
    const confirmed = this.state.participations.filter(
      (candidate) =>
        candidate.programId === programId && candidate.status === "CONFIRMED",
    ).length;
    if (!canReactToProgramMessage({
      user: actor,
      program,
      participation,
      approval,
      record,
      participantCounts: { confirmed },
    })) {
      throw new RepositoryError(
        "FORBIDDEN",
        "이 Program TALK에 반응을 남길 권한이 없습니다.",
      );
    }
    const next = clone(this.state);
    const existingIndex = next.messageReactions.findIndex(
      (reaction) =>
        reaction.messageId === messageId && reaction.userId === actorId,
    );
    const existing = existingIndex >= 0 ? next.messageReactions[existingIndex] : null;
    if (existing?.emoji === emoji) {
      next.messageReactions.splice(existingIndex, 1);
      this.commit(next, false);
      this.emitReactionChange(programId, messageId);
      return null;
    }

    const reaction = existing
      ? { ...existing, emoji, updatedAt: now }
      : {
          id: uniqueId("reaction"),
          programId,
          messageId,
          userId: actorId,
          emoji,
          createdAt: now,
          updatedAt: now,
        };
    if (existingIndex >= 0) next.messageReactions[existingIndex] = reaction;
    else next.messageReactions.push(reaction);
    this.commit(next, false);
    this.emitReactionChange(programId, messageId);
    return clone({
      ...reaction,
      user: {
        id: actor.id,
        name: actor.name,
        imageUrl: actor.imageUrl,
        seasons: [...(next.participatingSeasonsByUserId[actor.id] ?? [])],
      },
    });
  }

  async getUserById(userId: string): Promise<User | null> {
    const user = this.state.users.find((candidate) => candidate.id === userId);
    return user ? clone(user) : null;
  }

  async listUsers(viewerId: string): Promise<User[]> {
    requireAdmin(this.state, viewerId);
    return clone(this.state.users);
  }

  async listAdminPrograms(
    viewerId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<ProgramSnapshot[]> {
    requireAdmin(this.state, viewerId);
    return clone(
      [...this.state.programs]
        .sort((left, right) => Date.parse(left.startAt) - Date.parse(right.startAt))
        .map((program) =>
          buildProgramSnapshot(
            program,
            this.state.users,
            this.state.participations,
            this.state.records,
            now,
          ),
        ),
    );
  }

  async listAdminMessages(viewerId: string): Promise<ProgramMessage[]> {
    requireAdmin(this.state, viewerId);
    return clone(
      [...this.state.messages].sort(
        (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
      ),
    );
  }

  async listAdminMemberRegistrations(
    viewerId: string,
  ): Promise<AdminMemberRegistration[]> {
    requireAdmin(this.state, viewerId);
    const registrations = this.state.users.map((user) => ({
      user,
      participatingSeasons:
        this.state.participatingSeasonsByUserId[user.id] ?? [],
    }));
    registrations.sort((left, right) => {
      const leftPending = left.user.status === "PENDING" ? 0 : 1;
      const rightPending = right.user.status === "PENDING" ? 0 : 1;
      return (
        leftPending - rightPending ||
        left.user.name.localeCompare(right.user.name, "ko")
      );
    });
    return clone(registrations);
  }

  async approvePendingMember(
    userId: string,
    adminId: string,
    now: ISODateTime = new Date().toISOString(),
  ): Promise<AdminMemberRegistration> {
    requireAdmin(this.state, adminId);
    void now;
    const userIndex = this.state.users.findIndex((user) => user.id === userId);
    if (userIndex < 0) {
      throw new RepositoryError("NOT_FOUND", "승인할 Member를 찾을 수 없습니다.");
    }
    const target = this.state.users[userIndex];
    if (target.status !== "PENDING") {
      throw new RepositoryError(
        "INVALID_TRANSITION",
        "PENDING Member만 승인할 수 있습니다.",
      );
    }

    const approvedUser: User = { ...target, status: "MEMBER" };
    const next = clone(this.state);
    next.users[userIndex] = approvedUser;
    this.commit(next);
    return clone({
      user: approvedUser,
      participatingSeasons:
        next.participatingSeasonsByUserId[userId] ?? [],
    });
  }

  async listAdminRecords(viewerId: string): Promise<ProgramRecord[]> {
    requireAdmin(this.state, viewerId);
    return clone(
      [...this.state.records].sort(
        (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
      ),
    );
  }

  async listMemberDirectory(): Promise<MemberDirectoryEntry[]> {
    return clone(
      this.state.users
        .filter((user) => user.status === "MEMBER" || user.status === "ADMIN")
        .map(({ id, name, imageUrl, occupation, bio, interests }) => ({
          id,
          name,
          imageUrl,
          occupation,
          bio,
          interests,
        })),
    );
  }

  async listConfirmedParticipantUsers(
    programId: string,
    viewerId: string,
  ): Promise<User[]> {
    const program = this.state.programs.find(
      (candidate) => candidate.id === programId,
    );
    if (!program) {
      throw new RepositoryError("NOT_FOUND", "프로그램을 찾을 수 없습니다.");
    }
    if (!capabilitiesForState(this.state, program, viewerId).canAccessTalk) {
      throw new RepositoryError(
        "FORBIDDEN",
        "참가자 명단을 확인할 권한이 없습니다.",
      );
    }
    const confirmedUserIds = new Set(
      this.state.participations
        .filter((item) => item.programId === programId && item.status === "CONFIRMED")
        .map((item) => item.userId),
    );
    return clone(this.state.users.filter((user) => confirmedUserIds.has(user.id)));
  }

  private readPersistedState(): MockRepositoryState | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (raw === null) return null;
      const parsed: unknown = JSON.parse(raw);
      return isMockState(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private commit(next: MockRepositoryState, notify = true): void {
    next.revision = this.state.revision + 1;
    this.state = deepFreeze(next);
    this.persist();
    if (notify) this.emit();
  }

  private emitReactionChange(programId: string, messageId: string): void {
    for (const listener of this.reactionListeners.get(programId) ?? []) {
      listener(messageId);
    }
  }

  private persist(): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(this.storageKey, JSON.stringify(this.state));
    } catch {
      // The memory state remains usable when browser storage is unavailable.
    }
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export const mockRepository = new BrowserMockRepository();
