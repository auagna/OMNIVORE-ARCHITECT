import type {
  APPROVAL_STATUSES,
  CALENDAR_SCOPES,
  DERIVED_PROGRAM_STATUSES,
  GATHERING_CATEGORIES,
  GATHERING_COST_TYPES,
  MESSAGE_TYPES,
  PARTICIPATION_STATUSES,
  PAYMENT_STATUSES,
  PAGE_CONTENT_KEYS,
  PROGRAM_STATUSES,
  PROGRAM_TABS,
  PROGRAM_TYPES,
  TALK_ORIGINS,
  TALK_REGISTRATION_TYPES,
  USER_STATUSES,
} from "../constants/program";

export type ProgramType = (typeof PROGRAM_TYPES)[number];
export type GatheringCategory = (typeof GATHERING_CATEGORIES)[number];
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
export type DerivedProgramStatus = (typeof DERIVED_PROGRAM_STATUSES)[number];
export type ProgramDisplayStatus = ProgramStatus | DerivedProgramStatus;
export type ParticipationStatus = (typeof PARTICIPATION_STATUSES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type GatheringCostType = (typeof GATHERING_COST_TYPES)[number];
export type UserStatus = (typeof USER_STATUSES)[number];
export type MessageType = (typeof MESSAGE_TYPES)[number];
export type TalkOrigin = (typeof TALK_ORIGINS)[number];
export type TalkRegistrationType = (typeof TALK_REGISTRATION_TYPES)[number];
export type ProgramTab = (typeof PROGRAM_TABS)[number];
export type CalendarScope = (typeof CALENDAR_SCOPES)[number];
export type PageContentKey = (typeof PAGE_CONTENT_KEYS)[number];
export type ISODateTime = string;

export interface User {
  id: string;
  name: string;
  email: string;
  imageUrl: string | null;
  occupation: string | null;
  bio: string | null;
  interests: string[];
  status: UserStatus;
  createdAt: ISODateTime;
}

export type MemberDirectoryEntry = Pick<
  User,
  "id" | "name" | "imageUrl" | "occupation" | "bio" | "interests"
>;

export interface ProgramBase<TType extends ProgramType> {
  id: string;
  code: string;
  type: TType;
  title: string;
  description: string;
  hostId: string;
  startAt: ISODateTime;
  endAt: ISODateTime | null;
  location: string;
  mapUrl: string | null;
  capacity: number | null;
  status: ProgramStatus;
  coverImageId: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface FreeCost {
  type: "FREE";
}

export interface IndividualPurchaseCost {
  type: "INDIVIDUAL_PURCHASE";
  estimatedPrice: number | null;
  purchaseUrl: string | null;
  purchaseNote: string | null;
}

export interface HostCollectCost {
  type: "HOST_COLLECT";
  participationFee: number;
  feeIncludes: string | null;
  /** Restricted instructions are absent from public Program read models. */
  paymentInfo: string | null;
  paymentDeadline: ISODateTime | null;
  cancellationPolicy: string | null;
}

export type GatheringCost = FreeCost | IndividualPurchaseCost | HostCollectCost;

export interface CreateHostCollectCost extends Omit<HostCollectCost, "paymentInfo"> {
  paymentInfo: string;
}

export type CreateGatheringCost =
  | FreeCost
  | IndividualPurchaseCost
  | CreateHostCollectCost;

export interface GatheringDetail {
  programId: string;
  category: GatheringCategory;
  meetingPoint: string | null;
  recruitmentDeadline: ISODateTime | null;
  waitlistEnabled: boolean;
  cost: GatheringCost;
  bringItems: string | null;
  notice: string | null;
}

export interface TalkDetail {
  programId: string;
  origin: TalkOrigin;
  subtitle: string | null;
  speakerName: string;
  speakerAffiliation: string | null;
  speakerBio: string | null;
  organizer: string | null;
  address: string | null;
  sourceUrl: string | null;
  registrationType: TalkRegistrationType;
  registrationUrl: string | null;
}

export interface ReadingDetail {
  programId: string;
  resourceTitle: string | null;
}

export interface GatheringProgram extends ProgramBase<"GATHERING"> {
  detail: GatheringDetail;
}

export interface TalkProgram extends ProgramBase<"TALK"> {
  detail: TalkDetail;
}

export interface ReadingProgram extends ProgramBase<"READING"> {
  detail: ReadingDetail;
}

export type Program = GatheringProgram | TalkProgram | ReadingProgram;

export interface ProgramApproval {
  id: string;
  programId: string;
  requesterId: string;
  reviewerId: string | null;
  status: ApprovalStatus;
  requestedAt: ISODateTime | null;
  reviewedAt: ISODateTime | null;
  reviewComment: string | null;
  /** Non-null when a public version remains valid during a revision review. */
  publishedAt?: ISODateTime | null;
}

export interface GatheringProgramRevision {
  id: string;
  programId: string;
  approvalId: string;
  proposedBy: string;
  proposedProgram: GatheringProgram;
  changedFields: string[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Participation {
  id: string;
  programId: string;
  userId: string;
  status: ParticipationStatus;
  paymentStatus: PaymentStatus;
  joinedAt: ISODateTime;
}

export interface ProgramRecord {
  id: string;
  programId: string;
  authorId: string;
  /** Canonical v3.1 record text: 무엇을 했나요? */
  what: string;
  /** Canonical v3.1 reflection: 무엇을 발견했나요? */
  found: string | null;
  /** @deprecated Use `what`. Retained while v3 UI surfaces migrate. */
  summary: string;
  /** @deprecated Use `found`. Retained while v3 UI surfaces migrate. */
  body: string | null;
  photoMediaId: string | null;
  linkUrl: string | null;
  createdAt: ISODateTime;
}

export type RecordMaterialType = "PHOTO" | "LINK" | "REFERENCE";

export interface RecordMaterial {
  id: string;
  recordId: string;
  type: RecordMaterialType;
  mediaId: string | null;
  url: string | null;
  label: string | null;
  createdAt: ISODateTime;
}

export type CreateRecordMaterialInput =
  | { type: "PHOTO"; mediaId: string; label?: string | null }
  | { type: "LINK" | "REFERENCE"; url: string; label?: string | null };

export interface CreateRecordInput {
  what: string;
  found?: string | null;
  materials?: readonly CreateRecordMaterialInput[];
}

export interface ProgramRecordSnapshot {
  record: ProgramRecord;
  materials: RecordMaterial[];
}

export type ProgramActivityType =
  | "CREATED"
  | "SUBMITTED"
  | "APPROVED"
  | "CHANGES_REQUESTED"
  | "REJECTED"
  | "UPDATED"
  | "JOINED"
  | "LEFT"
  | "WAITLISTED"
  | "PAYMENT_CONFIRMED"
  | "NOTICE_POSTED"
  | "COMPLETED"
  | "RECORD_CREATED";

export type ActivityMetadataValue =
  | string
  | number
  | boolean
  | null
  | ActivityMetadataValue[]
  | { [key: string]: ActivityMetadataValue };

export interface ProgramActivity {
  id: string;
  programId: string;
  actorId: string;
  type: ProgramActivityType;
  metadata: Record<string, ActivityMetadataValue>;
  dedupeKey: string;
  createdAt: ISODateTime;
}

export type HomeActionType =
  | "CHANGES_REQUESTED"
  | "RECORD_REQUIRED"
  | "PAYMENT_REQUIRED";

export interface HomeAction {
  type: HomeActionType;
  programId: string;
  programTitle: string;
  description: string;
  createdAt: ISODateTime;
}

export interface ProgramMessage {
  id: string;
  programId: string;
  authorId: string;
  type: MessageType;
  content: string;
  parentId: string | null;
  isPinned: boolean;
  createdAt: ISODateTime;
  editedAt: ISODateTime | null;
}

export interface CreateProgramMessageInput {
  type: MessageType;
  content: string;
  parentId?: string | null;
  isPinned?: boolean;
}

export interface ProgramFilter {
  type?: ProgramType;
  category?: GatheringCategory;
  status?: ProgramStatus;
  from?: ISODateTime;
  to?: ISODateTime;
}

export interface ParticipantCounts {
  confirmed: number;
  waitlist: number;
  applied: number;
  cancelled: number;
}

export interface ProgramSnapshot {
  program: Program;
  /** Public-safe host identity; account fields are never part of Program reads. */
  host: MemberDirectoryEntry | null;
  participantCounts: ParticipantCounts;
  record: ProgramRecord | null;
  displayStatus: ProgramDisplayStatus;
}

export interface ProgramApprovalSnapshot {
  approval: ProgramApproval;
  snapshot: ProgramSnapshot;
  revision?: GatheringProgramRevision | null;
}

export interface PageContent {
  id: string;
  key: PageContentKey;
  title: string;
  headline: string;
  description: string;
  emptyState: string;
  updatedAt: ISODateTime;
  updatedBy: string | null;
}

export interface UpdatePageContentInput {
  title: string;
  headline: string;
  description: string;
  emptyState: string;
}

export type ProgramApprovalDecision =
  | { status: "APPROVED"; comment?: never }
  | { status: "CHANGES_REQUESTED"; comment: string }
  | { status: "REJECTED"; comment?: string | null };

export interface HomeRecordItem {
  record: ProgramRecord;
  program: Program;
}

export interface HomeData {
  next: ProgramSnapshot | null;
  open: ProgramSnapshot[];
  recentRecords: HomeRecordItem[];
}

export interface HostParticipant {
  participation: Participation;
  user: MemberDirectoryEntry;
}

export interface HostDashboard {
  snapshot: ProgramSnapshot;
  participants: HostParticipant[];
  payment: { paid: number; pending: number };
}

export interface JoinOutcome {
  participation: Participation;
  placement: "CONFIRMED" | "WAITLIST";
}

export interface CreateGatheringInput {
  title: string;
  category: GatheringCategory;
  description: string;
  startAt: ISODateTime;
  endAt: ISODateTime | null;
  location: string;
  meetingPoint: string | null;
  mapUrl: string | null;
  capacity: number;
  recruitmentDeadline: ISODateTime | null;
  waitlistEnabled: boolean;
  cost: CreateGatheringCost;
  bringItems: string | null;
  notice: string | null;
}
