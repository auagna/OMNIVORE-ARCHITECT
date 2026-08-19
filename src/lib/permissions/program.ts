import type {
  ISODateTime,
  MessageType,
  ParticipantCounts,
  Participation,
  Program,
  ProgramApproval,
  ProgramRecord,
  User,
} from "../../types";
import {
  getProgramCapabilities,
  isActiveProgramUser,
  isMatchingParticipation,
  isProgramHost as isProgramHostByPolicy,
} from "../../features/programs/domain";

export interface ProgramPermissionContext {
  user: User | null;
  program: Program;
  participation: Participation | null;
  approval?: ProgramApproval | null;
  record?: ProgramRecord | null;
  participantCounts?: Pick<ParticipantCounts, "confirmed">;
}

function capabilitiesFor(
  context: ProgramPermissionContext,
  now: ISODateTime = new Date().toISOString(),
) {
  return getProgramCapabilities({
    ...context,
    approval: context.approval ?? null,
    record: context.record ?? null,
    participantCounts: context.participantCounts ?? { confirmed: 0 },
    now,
  });
}

export function isActiveUser(user: User | null): user is User {
  return isActiveProgramUser(user);
}

export function isProgramHost(user: User | null, program: Program): boolean {
  return isProgramHostByPolicy(user, program);
}

export function canManageProgram(user: User | null, program: Program): boolean {
  return (
    isActiveUser(user) &&
    (user.status === "ADMIN" || isProgramHost(user, program))
  );
}

export function canSubmitGatheringProposal(user: User | null): user is User {
  return user !== null && user.status === "MEMBER";
}

export function canPublishProgramDirectly(user: User | null): user is User {
  return user !== null && user.status === "ADMIN";
}

export function canReviewProgramApproval(user: User | null): user is User {
  return user !== null && user.status === "ADMIN";
}

export function canViewProgramApproval(
  user: User | null,
  program: Program,
  approval: ProgramApproval,
): boolean {
  return (
    isActiveUser(user) &&
    (user.status === "ADMIN" ||
      user.id === program.hostId ||
      user.id === approval.requesterId)
  );
}

export function canViewDraftProgram(
  user: User | null,
  program: Program,
): boolean {
  return (
    program.status !== "DRAFT" ||
    (isActiveUser(user) &&
      (user.status === "ADMIN" || user.id === program.hostId))
  );
}

export function isConfirmedParticipant(
  context: ProgramPermissionContext,
): boolean {
  const { participation, program, user } = context;
  return (
    isMatchingParticipation(user, program, participation) &&
    participation.status === "CONFIRMED"
  );
}

export function canAccessProgramTalk(
  context: ProgramPermissionContext,
): boolean {
  return capabilitiesFor(context).canAccessTalk;
}

export function canWriteProgramMessage(
  context: ProgramPermissionContext,
  messageType: MessageType,
): boolean {
  const capabilities = capabilitiesFor(context);
  if (messageType === "NOTICE") return capabilities.canWriteNotice;
  if (messageType === "QUESTION") return capabilities.canWriteQuestion;
  return capabilities.canWriteChat;
}

export function canViewParticipantPayment(
  user: User | null,
  program: Program,
): boolean {
  return canManageProgram(user, program);
}

export function canJoinProgram(
  context: ProgramPermissionContext,
  now: ISODateTime = new Date().toISOString(),
): boolean {
  return capabilitiesFor(context, now).canJoin;
}
