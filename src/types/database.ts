import type {
  ApprovalStatus,
  GatheringCategory,
  GatheringCostType,
  MessageType,
  ParticipationStatus,
  PaymentStatus,
  ProgramActivityType,
  ProgramStatus,
  ProgramType,
  RecordMaterialType,
  TalkOrigin,
  TalkRegistrationType,
  UserStatus,
} from "./domain";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type InsertRow<
  Row,
  Required extends keyof Row,
  Generated extends keyof Row = never,
> = Pick<Row, Required> & Partial<Omit<Row, Required | Generated>>;

type UpdateRow<Row, Immutable extends keyof Row = never> = Partial<
  Omit<Row, Immutable>
>;

type TableDefinition<Row, Insert, Update> = {
  Row: Row & Record<string, unknown>;
  Insert: Insert & Record<string, unknown>;
  Update: Update & Record<string, unknown>;
  Relationships: [];
};

export interface UserRow {
  id: string;
  name: string;
  email: string;
  image_media_id: string | null;
  occupation: string | null;
  bio: string | null;
  interests: string[];
  status: UserStatus;
  created_at: string;
  updated_at: string;
}

export interface SeasonRow {
  id: string;
  name: string;
  start_at: string | null;
  end_at: string | null;
  is_current: boolean;
  created_at: string;
  updated_at: string;
}

export interface MembershipRow {
  id: string;
  user_id: string;
  season_id: string;
  role: string | null;
  created_at: string;
}

export interface ProgramRow {
  id: string;
  code: string;
  type: ProgramType;
  title: string;
  description: string;
  host_id: string;
  start_at: string;
  end_at: string | null;
  location: string;
  map_url: string | null;
  capacity: number | null;
  status: ProgramStatus;
  cover_image_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface GatheringDetailRow {
  program_id: string;
  detail_type: "GATHERING";
  category: GatheringCategory;
  meeting_point: string | null;
  recruitment_deadline: string | null;
  waitlist_enabled: boolean;
  cost_type: GatheringCostType;
  estimated_price: number | null;
  purchase_url: string | null;
  purchase_note: string | null;
  participation_fee: number | null;
  fee_includes: string | null;
  payment_deadline: string | null;
  cancellation_policy: string | null;
  bring_items: string | null;
  notice: string | null;
}

export interface GatheringPaymentInstructionRow {
  program_id: string;
  payment_info: string;
  updated_at: string;
}

export interface TalkDetailRow {
  program_id: string;
  detail_type: "TALK";
  origin: TalkOrigin;
  subtitle: string | null;
  speaker_name: string;
  speaker_affiliation: string | null;
  speaker_bio: string | null;
  organizer: string | null;
  address: string | null;
  source_url: string | null;
  registration_type: TalkRegistrationType;
  registration_url: string | null;
}

export interface ReadingDetailRow {
  program_id: string;
  detail_type: "READING";
  resource_title: string | null;
}

export interface ParticipationRow {
  id: string;
  program_id: string;
  user_id: string;
  status: ParticipationStatus;
  payment_status: PaymentStatus;
  joined_at: string;
  updated_at: string;
}

export type MediaTonePreset = "OA_NEUTRAL" | "MONOCHROME" | "ORIGINAL";

export interface MediaRow {
  id: string;
  uploaded_by: string;
  storage_bucket: string;
  storage_path: string;
  focal_x: number;
  focal_y: number;
  tone_preset: MediaTonePreset;
  created_at: string;
  updated_at: string;
}

export interface MediaSourceRow {
  media_id: string;
  original_url: string | null;
  source_bucket: string | null;
  source_path: string | null;
  created_at: string;
}

export interface ProgramMessageRow {
  id: string;
  program_id: string;
  author_id: string;
  type: MessageType;
  content: string;
  parent_id: string | null;
  is_pinned: boolean;
  created_at: string;
  edited_at: string | null;
}

export interface MessageReadRow {
  message_id: string;
  user_id: string;
  read_at: string;
}

export interface ProgramMessageMentionRow {
  message_id: string;
  user_id: string;
  created_at: string;
}

export interface TagRow {
  id: string;
  name: string;
  created_at: string;
}

export interface ProgramTagRow {
  program_id: string;
  tag_id: string;
}

export interface ProgramApprovalRow {
  id: string;
  program_id: string;
  requester_id: string;
  reviewer_id: string | null;
  status: ApprovalStatus;
  requested_at: string | null;
  reviewed_at: string | null;
  review_comment: string | null;
  published_at: string | null;
}

export interface PageContentRow {
  id: string;
  key: string;
  title: string;
  headline: string;
  description: string;
  empty_state: string;
  updated_at: string;
  updated_by: string | null;
}

export interface ProgramActivityRow {
  id: string;
  program_id: string;
  actor_id: string | null;
  type: ProgramActivityType;
  metadata: Json;
  dedupe_key: string | null;
  created_at: string;
}

export interface RecordRow {
  id: string;
  program_id: string;
  author_id: string;
  what: string;
  found: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecordMaterialRow {
  id: string;
  record_id: string;
  type: RecordMaterialType;
  media_id: string | null;
  url: string | null;
  label: string | null;
  position: number;
  created_at: string;
}

export interface ProgramRevisionRow {
  id: string;
  program_id: string;
  approval_id: string;
  proposed_by: string;
  proposed_snapshot: Json;
  changed_fields: string[];
  created_at: string;
  updated_at: string;
}

/** Public-safe identity shape. Deliberately excludes account and operational data. */
export interface SafeMemberRow {
  id: string;
  name: string;
  image_media_id: string | null;
  occupation: string | null;
  bio: string | null;
  interests: string[];
}

export interface ActiveMemberDirectoryRow extends SafeMemberRow {
  participating_seasons: string[];
}

export interface ProgramParticipantCountsRow {
  confirmed_count: number;
  waitlist_count: number;
}

export interface HostParticipantReadRow extends SafeMemberRow {
  participation_id: string;
  participation_status: ParticipationStatus;
  payment_status: PaymentStatus;
  joined_at: string;
}

type UserInsert = InsertRow<UserRow, "id" | "name" | "email">;
type SeasonInsert = InsertRow<SeasonRow, "name">;
type MembershipInsert = InsertRow<MembershipRow, "user_id" | "season_id">;
type ProgramInsert = InsertRow<
  ProgramRow,
  "code" | "type" | "title" | "host_id" | "start_at" | "location"
>;
type GatheringDetailInsert = InsertRow<
  GatheringDetailRow,
  "program_id" | "category",
  "detail_type"
>;
type TalkDetailInsert = InsertRow<
  TalkDetailRow,
  "program_id" | "origin" | "speaker_name",
  "detail_type"
>;
type ReadingDetailInsert = InsertRow<ReadingDetailRow, "program_id", "detail_type">;

export interface Database {
  public: {
    Tables: {
      users: TableDefinition<UserRow, UserInsert, UpdateRow<UserRow, "id" | "created_at">>;
      seasons: TableDefinition<SeasonRow, SeasonInsert, UpdateRow<SeasonRow, "id" | "created_at">>;
      memberships: TableDefinition<
        MembershipRow,
        MembershipInsert,
        UpdateRow<MembershipRow, "id" | "created_at">
      >;
      programs: TableDefinition<ProgramRow, ProgramInsert, UpdateRow<ProgramRow, "id" | "created_at">>;
      gathering_details: TableDefinition<
        GatheringDetailRow,
        GatheringDetailInsert,
        UpdateRow<GatheringDetailRow, "program_id" | "detail_type">
      >;
      gathering_payment_instructions: TableDefinition<
        GatheringPaymentInstructionRow,
        InsertRow<GatheringPaymentInstructionRow, "program_id" | "payment_info">,
        UpdateRow<GatheringPaymentInstructionRow, "program_id">
      >;
      talk_details: TableDefinition<
        TalkDetailRow,
        TalkDetailInsert,
        UpdateRow<TalkDetailRow, "program_id" | "detail_type">
      >;
      reading_details: TableDefinition<
        ReadingDetailRow,
        ReadingDetailInsert,
        UpdateRow<ReadingDetailRow, "program_id" | "detail_type">
      >;
      participations: TableDefinition<
        ParticipationRow,
        InsertRow<ParticipationRow, "program_id" | "user_id" | "status">,
        UpdateRow<ParticipationRow, "id" | "program_id" | "user_id" | "joined_at">
      >;
      media: TableDefinition<
        MediaRow,
        InsertRow<MediaRow, "uploaded_by" | "storage_path">,
        UpdateRow<MediaRow, "id" | "uploaded_by" | "created_at">
      >;
      media_sources: TableDefinition<
        MediaSourceRow,
        InsertRow<MediaSourceRow, "media_id">,
        UpdateRow<MediaSourceRow, "media_id" | "created_at">
      >;
      program_messages: TableDefinition<
        ProgramMessageRow,
        InsertRow<ProgramMessageRow, "program_id" | "author_id" | "content">,
        UpdateRow<ProgramMessageRow, "id" | "program_id" | "author_id" | "created_at">
      >;
      message_reads: TableDefinition<
        MessageReadRow,
        InsertRow<MessageReadRow, "message_id" | "user_id">,
        UpdateRow<MessageReadRow, "message_id" | "user_id">
      >;
      program_message_mentions: TableDefinition<
        ProgramMessageMentionRow,
        InsertRow<ProgramMessageMentionRow, "message_id" | "user_id">,
        UpdateRow<ProgramMessageMentionRow, "message_id" | "user_id" | "created_at">
      >;
      tags: TableDefinition<TagRow, InsertRow<TagRow, "name">, UpdateRow<TagRow, "id" | "created_at">>;
      program_tags: TableDefinition<
        ProgramTagRow,
        ProgramTagRow,
        UpdateRow<ProgramTagRow, "program_id" | "tag_id">
      >;
      program_approvals: TableDefinition<
        ProgramApprovalRow,
        InsertRow<ProgramApprovalRow, "program_id" | "requester_id">,
        UpdateRow<ProgramApprovalRow, "id" | "program_id">
      >;
      page_content: TableDefinition<
        PageContentRow,
        InsertRow<PageContentRow, "key">,
        UpdateRow<PageContentRow, "id" | "key">
      >;
      program_activities: TableDefinition<
        ProgramActivityRow,
        InsertRow<ProgramActivityRow, "program_id" | "type">,
        UpdateRow<ProgramActivityRow, "id" | "program_id" | "created_at">
      >;
      records: TableDefinition<
        RecordRow,
        InsertRow<RecordRow, "program_id" | "author_id" | "what">,
        UpdateRow<RecordRow, "id" | "program_id" | "author_id" | "created_at">
      >;
      record_materials: TableDefinition<
        RecordMaterialRow,
        InsertRow<RecordMaterialRow, "record_id" | "type">,
        UpdateRow<RecordMaterialRow, "id" | "record_id" | "created_at">
      >;
      program_revisions: TableDefinition<
        ProgramRevisionRow,
        InsertRow<
          ProgramRevisionRow,
          "program_id" | "approval_id" | "proposed_by" | "proposed_snapshot" | "changed_fields"
        >,
        UpdateRow<ProgramRevisionRow, "id" | "program_id" | "approval_id" | "created_at">
      >;
    };
    Views: Record<string, never>;
    Functions: {
      list_active_members: {
        Args: Record<string, never>;
        Returns: ActiveMemberDirectoryRow[];
      };
      get_program_host_profile: {
        Args: { p_program_id: string };
        Returns: SafeMemberRow[];
      };
      get_program_participant_counts: {
        Args: { p_program_id: string };
        Returns: ProgramParticipantCountsRow[];
      };
      list_program_confirmed_people: {
        Args: { p_program_id: string };
        Returns: SafeMemberRow[];
      };
      list_program_host_participants: {
        Args: { p_program_id: string };
        Returns: HostParticipantReadRow[];
      };
      is_oa_admin: { Args: Record<string, never>; Returns: boolean };
      can_read_program_talk: { Args: { p_program_id: string }; Returns: boolean };
      can_write_program_talk: { Args: { p_program_id: string }; Returns: boolean };
      can_write_program_notice: { Args: { p_program_id: string }; Returns: boolean };
      program_has_published_version: { Args: { p_program_id: string }; Returns: boolean };
      review_program_approval: {
        Args: { p_program_id: string; p_decision: ApprovalStatus; p_comment?: string | null };
        Returns: ProgramApprovalRow;
      };
      submit_program_revision: {
        Args: {
          p_program_id: string;
          p_proposed_snapshot: Json;
          p_changed_fields?: string[] | null;
        };
        Returns: ProgramRevisionRow;
      };
      review_program_revision: {
        Args: { p_program_id: string; p_decision: ApprovalStatus; p_comment?: string | null };
        Returns: ProgramApprovalRow;
      };
      apply_program_revision_snapshot: {
        Args: { p_program_id: string; p_proposed_snapshot: Json };
        Returns: undefined;
      };
      create_gathering_proposal: {
        Args: { p_snapshot: Json };
        Returns: ProgramApprovalRow;
      };
      resubmit_gathering_proposal: {
        Args: { p_program_id: string; p_snapshot: Json };
        Returns: ProgramApprovalRow;
      };
      publish_gathering: {
        Args: { p_snapshot: Json };
        Returns: ProgramRow;
      };
      update_gathering: {
        Args: { p_program_id: string; p_snapshot: Json };
        Returns: ProgramRow;
      };
      join_program: { Args: { p_program_id: string }; Returns: ParticipationRow };
      cancel_own_participation: { Args: { p_program_id: string }; Returns: ParticipationRow };
      confirm_participation_payment: {
        Args: { p_participation_id: string };
        Returns: ParticipationRow;
      };
      set_program_status: {
        Args: { p_program_id: string; p_status: ProgramStatus };
        Returns: ProgramRow;
      };
      create_program_record: {
        Args: {
          p_program_id: string;
          p_what: string;
          p_found?: string | null;
          p_materials?: Json;
        };
        Returns: RecordRow;
      };
      update_program_record: {
        Args: {
          p_program_id: string;
          p_what: string;
          p_found?: string | null;
          p_materials?: Json;
        };
        Returns: RecordRow;
      };
    };
    Enums: {
      user_status: UserStatus;
      program_type: ProgramType;
      program_status: ProgramStatus;
      gathering_category: GatheringCategory;
      gathering_cost_type: GatheringCostType;
      talk_origin: TalkOrigin;
      talk_registration_type: TalkRegistrationType;
      participation_status: ParticipationStatus;
      payment_status: PaymentStatus;
      message_type: MessageType;
      media_tone_preset: MediaTonePreset;
      approval_status: ApprovalStatus;
      program_activity_type: ProgramActivityType;
      record_material_type: RecordMaterialType;
    };
    CompositeTypes: Record<string, never>;
  };
}

export type Tables<
  Name extends keyof Database["public"]["Tables"],
> = Database["public"]["Tables"][Name]["Row"];

export type TablesInsert<
  Name extends keyof Database["public"]["Tables"],
> = Database["public"]["Tables"][Name]["Insert"];

export type TablesUpdate<
  Name extends keyof Database["public"]["Tables"],
> = Database["public"]["Tables"][Name]["Update"];
