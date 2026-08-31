import type {
  ISODateTime,
  ParticipantCounts,
  Participation,
  Program,
  ProgramApproval,
  ProgramRecord,
  User,
} from "../../../types";
import {
  approvalAllowsPublishedOperation,
  canViewProgramByPolicy,
  isActiveProgramUser,
  isMatchingParticipation,
  isProgramAdmin,
  isProgramHost,
} from "./program-policy";
import { isProgramFull } from "./program-display-state";

export interface ProgramCapabilities {
  canView: boolean;
  canJoin: boolean;
  canCancelParticipation: boolean;
  canAccessTalk: boolean;
  canWriteChat: boolean;
  canWriteQuestion: boolean;
  canWriteNotice: boolean;
  canReactToMessage: boolean;
  canEditProgram: boolean;
  canCloseRecruitment: boolean;
  canCancelProgram: boolean;
  canManageParticipants: boolean;
  canManagePayments: boolean;
  canViewPaymentInstructions: boolean;
  canSubmitForApproval: boolean;
  canReviewApproval: boolean;
  canWriteRecord: boolean;
  canEditRecord: boolean;
}

export interface ProgramCapabilityContext {
  user: User | null;
  program: Program;
  participation: Participation | null;
  approval: ProgramApproval | null;
  record: ProgramRecord | null;
  participantCounts: Pick<ParticipantCounts, "confirmed">;
  now?: ISODateTime;
}

export function getProgramCapabilities({
  user,
  program,
  participation,
  approval,
  record,
  participantCounts,
  now = new Date().toISOString(),
}: ProgramCapabilityContext): ProgramCapabilities {
  const active = isActiveProgramUser(user);
  const admin = active && isProgramAdmin(user);
  const host = active && isProgramHost(user, program);
  const matchesParticipation = isMatchingParticipation(user, program, participation);
  const confirmed = matchesParticipation && participation.status === "CONFIRMED";
  const cancelledParticipant =
    matchesParticipation && participation.status === "CANCELLED";
  const talkMember = admin || host || confirmed;
  const canView = canViewProgramByPolicy(user, program, approval);
  const canAccessTalk = canView && (talkMember || cancelledParticipant);
  const talkIsReadOnly = program.status === "CANCELLED" || cancelledParticipant;
  const canWriteTalk = canAccessTalk && !talkIsReadOnly;
  const manager = admin || host;
  const approvalStatus = approval?.status ?? null;
  const beforeStart = Date.parse(now) < Date.parse(program.startAt);
  const atCapacity = isProgramFull(program, participantCounts.confirmed);
  const canEnterWaitlist =
    program.type === "GATHERING" && program.detail.waitlistEnabled;
  const hasCurrentParticipation =
    matchesParticipation && participation.status !== "CANCELLED";
  const recruitmentDeadlineOpen =
    program.type !== "GATHERING" ||
    program.detail.recruitmentDeadline === null ||
    Date.parse(now) <= Date.parse(program.detail.recruitmentDeadline);
  const editableLifecycle =
    program.status !== "CANCELLED" && program.status !== "COMPLETED";
  const hostCanEditApproval =
    approvalStatus !== "PENDING" && approvalStatus !== "REJECTED";
  const canOperatePublishedProgram =
    program.status !== "DRAFT" && program.status !== "CANCELLED";

  const canJoin =
    user?.status === "MEMBER" &&
    !host &&
    canView &&
    program.status === "OPEN" &&
    approvalAllowsPublishedOperation(approval) &&
    beforeStart &&
    recruitmentDeadlineOpen &&
    !hasCurrentParticipation &&
    (!atCapacity || canEnterWaitlist);
  const canCancelParticipation =
    active &&
    matchesParticipation &&
    participation.status !== "CANCELLED" &&
    program.status !== "CANCELLED" &&
    program.status !== "COMPLETED" &&
    beforeStart;
  const canEditProgram = admin
    ? approvalStatus !== "PENDING"
    : host && editableLifecycle && hostCanEditApproval;
  const canManageParticipants =
    manager &&
    canOperatePublishedProgram &&
    approvalAllowsPublishedOperation(approval);
  const recordOwner =
    user !== null && active && record !== null && record.authorId === user.id;

  return {
    canView,
    canJoin,
    canCancelParticipation,
    canAccessTalk,
    canWriteChat: canWriteTalk && talkMember,
    canWriteQuestion: canWriteTalk && talkMember,
    canWriteNotice: canWriteTalk && (admin || host),
    canReactToMessage: canWriteTalk && talkMember,
    canEditProgram,
    canCloseRecruitment:
      manager &&
      program.status === "OPEN" &&
      approvalAllowsPublishedOperation(approval),
    canCancelProgram:
      manager &&
      (program.status === "OPEN" || program.status === "CLOSED") &&
      approvalAllowsPublishedOperation(approval),
    canManageParticipants,
    canManagePayments:
      canManageParticipants &&
      program.type === "GATHERING" &&
      program.detail.cost.type === "HOST_COLLECT",
    canViewPaymentInstructions:
      active &&
      program.type === "GATHERING" &&
      program.detail.cost.type === "HOST_COLLECT" &&
      (manager || confirmed),
    canSubmitForApproval:
      user?.status === "MEMBER" &&
      host &&
      program.type === "GATHERING" &&
      program.status === "DRAFT" &&
      (approvalStatus === "DRAFT" || approvalStatus === "CHANGES_REQUESTED"),
    canReviewApproval: admin && approvalStatus === "PENDING",
    canWriteRecord:
      manager && program.status === "COMPLETED" && record === null,
    canEditRecord:
      program.status === "COMPLETED" && record !== null && (manager || recordOwner),
  };
}
