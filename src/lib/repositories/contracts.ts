import type {
  AdminMemberRegistration,
  ApprovalStatus,
  CalendarScope,
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
  Program,
  ProgramActivity,
  ProgramMessage,
  ProgramApproval,
  ProgramApprovalDecision,
  ProgramApprovalSnapshot,
  ProgramFilter,
  ProgramRecord,
  ProgramRecordSnapshot,
  RecordMaterial,
  CreateRecordInput,
  ProgramSnapshot,
  ProgramStatus,
  UpdatePageContentInput,
  User,
} from "../../types";
import type {
  MessageReactionChangeListener,
  MessageReactionEmoji,
  MessageReactionSnapshot,
  MessageReaction,
} from "../../features/conversation/reactions";

export interface MockRepositoryState {
  schemaVersion: 5;
  revision: number;
  users: User[];
  programs: Program[];
  approvals: ProgramApproval[];
  programRevisions: GatheringProgramRevision[];
  participations: Participation[];
  records: ProgramRecord[];
  recordMaterials: RecordMaterial[];
  activities: ProgramActivity[];
  messages: ProgramMessage[];
  messageReactions: MessageReaction[];
  participatingSeasonsByUserId: Record<string, string[]>;
  pageContents: PageContent[];
}

/**
 * Minimal reactive state shared by every repository adapter.
 *
 * Domain queries stay transport-agnostic while React can invalidate cached
 * reads after a local mutation or a realtime event. Mock-only fixtures remain
 * on MockRepositoryState and are deliberately not part of OARepository.
 */
export interface RepositorySnapshot {
  revision: number;
}

export interface RepositoryRuntime {
  subscribe(listener: () => void): () => void;
  getSnapshot(): Readonly<RepositorySnapshot>;
  getServerSnapshot(): Readonly<RepositorySnapshot>;
}

export interface ResettableRepository {
  reset(): void;
}

export interface ProgramRepository {
  listPrograms(
    filter?: ProgramFilter,
    now?: ISODateTime,
  ): Promise<ProgramSnapshot[]>;
  getProgramById(
    programId: string,
    viewerId?: string | null,
  ): Promise<Program | null>;
  getProgramSnapshotById(
    programId: string,
    now?: ISODateTime,
    viewerId?: string | null,
  ): Promise<ProgramSnapshot | null>;
  getHomeData(now?: ISODateTime): Promise<HomeData>;
  listMyActions(userId: string, now?: ISODateTime): Promise<HomeAction[]>;
  listCalendarPrograms(
    from: ISODateTime,
    to: ISODateTime,
    now?: ISODateTime,
    scope?: CalendarScope,
    viewerId?: string | null,
  ): Promise<ProgramSnapshot[]>;
  submitGatheringForApproval(
    input: CreateGatheringInput,
    requesterId: string,
    now?: ISODateTime,
  ): Promise<ProgramApprovalSnapshot>;
  resubmitGatheringForApproval(
    programId: string,
    input: CreateGatheringInput,
    requesterId: string,
    now?: ISODateTime,
  ): Promise<ProgramApprovalSnapshot>;
  publishGathering(
    input: CreateGatheringInput,
    adminId: string,
    now?: ISODateTime,
  ): Promise<GatheringProgram>;
  updateGathering(
    programId: string,
    input: CreateGatheringInput,
    actorId: string,
    now?: ISODateTime,
  ): Promise<GatheringProgram>;
  setProgramStatus(
    programId: string,
    status: ProgramStatus,
    actorId: string,
    now?: ISODateTime,
  ): Promise<Program>;
  listHostedPrograms(
    userId: string,
    now?: ISODateTime,
  ): Promise<ProgramSnapshot[]>;
  getHostDashboard(
    programId: string,
    viewerId: string,
    now?: ISODateTime,
  ): Promise<HostDashboard>;
}

export interface ApprovalRepository {
  getProgramApproval(
    programId: string,
    viewerId: string,
  ): Promise<ProgramApproval | null>;
  getGatheringRevision(
    programId: string,
    viewerId: string,
  ): Promise<GatheringProgramRevision | null>;
  listMyProposals(
    requesterId: string,
    now?: ISODateTime,
  ): Promise<ProgramApprovalSnapshot[]>;
  listApprovalQueue(
    reviewerId: string,
    statuses?: readonly ApprovalStatus[],
    now?: ISODateTime,
  ): Promise<ProgramApprovalSnapshot[]>;
  reviewProgramApproval(
    programId: string,
    decision: ProgramApprovalDecision,
    reviewerId: string,
    now?: ISODateTime,
  ): Promise<ProgramApprovalSnapshot>;
}

export interface PageContentRepository {
  getPageContent(key: PageContentKey): Promise<PageContent | null>;
  listPageContents(): Promise<PageContent[]>;
  updatePageContent(
    key: PageContentKey,
    input: UpdatePageContentInput,
    adminId: string,
    now?: ISODateTime,
  ): Promise<PageContent>;
}

export interface ParticipationRepository {
  joinProgram(
    programId: string,
    userId: string,
    now?: ISODateTime,
  ): Promise<JoinOutcome>;
  cancelParticipation(
    programId: string,
    userId: string,
    now?: ISODateTime,
  ): Promise<Participation>;
  getParticipation(
    programId: string,
    userId: string,
  ): Promise<Participation | null>;
  listParticipationsForProgram(programId: string): Promise<Participation[]>;
  listMyUpcoming(
    userId: string,
    now?: ISODateTime,
  ): Promise<ProgramSnapshot[]>;
  confirmParticipationPayment(
    participationId: string,
    actorId: string,
    now?: ISODateTime,
  ): Promise<Participation>;
}

export interface RecordRepository {
  getRecordByProgramId(programId: string): Promise<ProgramRecord | null>;
  getRecordSnapshotByProgramId(
    programId: string,
  ): Promise<ProgramRecordSnapshot | null>;
  listRecords(): Promise<ProgramRecord[]>;
  createRecord(
    programId: string,
    input: CreateRecordInput,
    authorId: string,
    now?: ISODateTime,
  ): Promise<ProgramRecordSnapshot>;
  updateRecord(
    programId: string,
    input: CreateRecordInput,
    actorId: string,
    now?: ISODateTime,
  ): Promise<ProgramRecordSnapshot>;
}

export interface ActivityRepository {
  listProgramActivities(
    programId: string,
    viewerId: string,
  ): Promise<ProgramActivity[]>;
}

export interface ConversationRepository {
  listProgramMessages(
    programId: string,
    viewerId: string,
  ): Promise<ProgramMessage[]>;
  /**
   * Watch one Program TALK for transport-level changes.
   *
   * The callback payload is intentionally not exposed: adapters only
   * invalidate repository reads, which are then authorized and refetched
   * through the normal RLS-protected query path.
   */
  watchProgramMessages(
    programId: string,
    onReactionChange?: MessageReactionChangeListener,
  ): () => void;
  postProgramMessage(
    programId: string,
    input: CreateProgramMessageInput,
    authorId: string,
    now?: ISODateTime,
  ): Promise<ProgramMessage>;
  listProgramMessageReactions(
    programId: string,
    viewerId: string,
    messageIds?: readonly string[],
  ): Promise<MessageReactionSnapshot[]>;
  toggleProgramMessageReaction(
    programId: string,
    messageId: string,
    emoji: MessageReactionEmoji,
    actorId: string,
    now?: ISODateTime,
  ): Promise<MessageReactionSnapshot | null>;
}

export interface UserRepository {
  getUserById(userId: string): Promise<User | null>;
  listUsers(viewerId: string): Promise<User[]>;
  listMemberDirectory(): Promise<MemberDirectoryEntry[]>;
  listConfirmedParticipantUsers(
    programId: string,
    viewerId: string,
  ): Promise<MemberDirectoryEntry[]>;
}

export interface AdminRepository {
  listAdminPrograms(
    viewerId: string,
    now?: ISODateTime,
  ): Promise<ProgramSnapshot[]>;
  listAdminMessages(viewerId: string): Promise<ProgramMessage[]>;
  listAdminMemberRegistrations(
    viewerId: string,
  ): Promise<AdminMemberRegistration[]>;
  approvePendingMember(
    userId: string,
    adminId: string,
    now?: ISODateTime,
  ): Promise<AdminMemberRegistration>;
  listAdminRecords(viewerId: string): Promise<ProgramRecord[]>;
}

export interface OARepository
  extends ProgramRepository,
    ApprovalRepository,
    ParticipationRepository,
    RecordRepository,
    ActivityRepository,
    ConversationRepository,
    UserRepository,
    AdminRepository,
    PageContentRepository,
    RepositoryRuntime {}

export function isResettableRepository(
  repository: OARepository,
): repository is OARepository & ResettableRepository {
  return "reset" in repository && typeof repository.reset === "function";
}

export type RepositoryErrorCode =
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION"
  | "NOT_OPEN"
  | "ALREADY_JOINED"
  | "CAPACITY_FULL"
  | "RECRUITMENT_CLOSED"
  | "INVALID_TRANSITION"
  | "APPROVAL_REQUIRED";

export class RepositoryError extends Error {
  constructor(
    public readonly code: RepositoryErrorCode,
    message: string,
    public readonly details: readonly { field: string; message: string }[] = [],
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}
