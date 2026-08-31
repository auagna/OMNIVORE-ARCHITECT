import type { OARepository } from "@/lib/repositories";
import type {
  GatheringCategory,
  ISODateTime,
  ProgramMessage,
  ProgramRecord,
  ProgramSnapshot,
  ProgramType,
  User,
} from "@/types";

export type AdminConversationTypeFilter = "ALL" | ProgramType;
export type AdminConversationCategoryFilter = "ALL" | GatheringCategory;

export interface AdminConversationRoom {
  snapshot: ProgramSnapshot;
  latestMessage: ProgramMessage | null;
  latestAuthorName: string | null;
  messageCount: number;
  pinnedNoticeCount: number;
  unansweredQuestionCount: number;
}

export interface AdminOverviewData {
  approvals: number;
  pendingMembers: number;
  recordRequired: number;
  unansweredQuestions: number;
}

export type AdminRecordState = "REQUIRED" | "RECORDED";

export interface AdminRecordRow {
  snapshot: ProgramSnapshot;
  record: ProgramRecord | null;
  state: AdminRecordState;
}

function timestamp(value: ISODateTime): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function buildAdminRecordRows(
  programs: readonly ProgramSnapshot[],
  records: readonly ProgramRecord[],
): AdminRecordRow[] {
  const recordsByProgram = new Map(records.map((record) => [record.programId, record]));
  return programs
    .map((snapshot): AdminRecordRow | null => {
      const record = recordsByProgram.get(snapshot.program.id) ?? null;
      if (snapshot.program.status !== "COMPLETED" && !record) return null;
      return {
        snapshot,
        record,
        state: record ? "RECORDED" : "REQUIRED",
      };
    })
    .filter((row): row is AdminRecordRow => row !== null)
    .sort(
      (left, right) =>
        Number(right.state === "REQUIRED") - Number(left.state === "REQUIRED") ||
        timestamp(right.snapshot.program.endAt ?? right.snapshot.program.startAt) -
          timestamp(left.snapshot.program.endAt ?? left.snapshot.program.startAt),
    );
}

export function buildAdminConversationRooms(
  programs: readonly ProgramSnapshot[],
  messages: readonly ProgramMessage[],
  users: readonly Pick<User, "id" | "name">[],
): AdminConversationRoom[] {
  const authorNames = new Map(users.map((user) => [user.id, user.name]));
  const messagesByProgram = new Map<string, ProgramMessage[]>();

  for (const message of messages) {
    const programMessages = messagesByProgram.get(message.programId) ?? [];
    programMessages.push(message);
    messagesByProgram.set(message.programId, programMessages);
  }

  return programs
    .map((snapshot): AdminConversationRoom => {
      const programMessages = [...(messagesByProgram.get(snapshot.program.id) ?? [])]
        .sort((left, right) => timestamp(left.createdAt) - timestamp(right.createdAt));
      const repliedMessageIds = new Set(
        programMessages.flatMap((message) => message.parentId ? [message.parentId] : []),
      );
      const latestMessage = programMessages.at(-1) ?? null;

      return {
        snapshot,
        latestMessage,
        latestAuthorName: latestMessage
          ? authorNames.get(latestMessage.authorId) ?? null
          : null,
        messageCount: programMessages.length,
        pinnedNoticeCount: programMessages.filter(
          (message) => message.type === "NOTICE" && message.isPinned,
        ).length,
        unansweredQuestionCount: programMessages.filter(
          (message) =>
            message.type === "QUESTION" &&
            message.parentId === null &&
            !repliedMessageIds.has(message.id),
        ).length,
      };
    })
    .sort((left, right) => {
      if (!left.latestMessage && right.latestMessage) return 1;
      if (left.latestMessage && !right.latestMessage) return -1;
      if (left.latestMessage && right.latestMessage) {
        const activityOrder =
          timestamp(right.latestMessage.createdAt) -
          timestamp(left.latestMessage.createdAt);
        if (activityOrder !== 0) return activityOrder;
      }
      return left.snapshot.program.title.localeCompare(
        right.snapshot.program.title,
        "ko-KR",
      );
    });
}

export function filterAdminConversationRooms(
  rooms: readonly AdminConversationRoom[],
  type: AdminConversationTypeFilter,
  category: AdminConversationCategoryFilter = "ALL",
): AdminConversationRoom[] {
  return rooms.filter(({ snapshot }) => {
    const program = snapshot.program;
    if (type !== "ALL" && program.type !== type) return false;
    if (type !== "GATHERING" || category === "ALL") return true;
    return program.type === "GATHERING" && program.detail.category === category;
  });
}

export async function loadAdminConversationRooms(
  repository: OARepository,
  viewerId: string,
  now: ISODateTime = new Date().toISOString(),
): Promise<AdminConversationRoom[]> {
  const [programs, messages, users] = await Promise.all([
    repository.listAdminPrograms(viewerId, now),
    repository.listAdminMessages(viewerId),
    repository.listUsers(viewerId),
  ]);

  return buildAdminConversationRooms(programs, messages, users);
}

export async function loadAdminOverview(
  repository: OARepository,
  viewerId: string,
  now: ISODateTime = new Date().toISOString(),
): Promise<AdminOverviewData> {
  const [approvals, registrations, programs, messages] = await Promise.all([
    repository.listApprovalQueue(viewerId, ["PENDING"], now),
    repository.listAdminMemberRegistrations(viewerId),
    repository.listAdminPrograms(viewerId, now),
    repository.listAdminMessages(viewerId),
  ]);
  const rooms = buildAdminConversationRooms(
    programs,
    messages,
    registrations.map(({ user }) => user),
  );

  return {
    approvals: approvals.length,
    pendingMembers: registrations.filter(({ user }) => user.status === "PENDING").length,
    recordRequired: programs.filter(
      ({ displayStatus }) => displayStatus === "RECORD_REQUIRED",
    ).length,
    unansweredQuestions: rooms.reduce(
      (total, room) => total + room.unansweredQuestionCount,
      0,
    ),
  };
}
