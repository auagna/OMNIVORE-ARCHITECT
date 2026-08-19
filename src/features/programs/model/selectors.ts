import type {
  ApprovalStatus,
  CalendarScope,
  HomeData,
  ISODateTime,
  MemberDirectoryEntry,
  ParticipantCounts,
  Participation,
  Program,
  ProgramApproval,
  ProgramApprovalSnapshot,
  ProgramDisplayStatus,
  ProgramFilter,
  ProgramRecord,
  ProgramSnapshot,
  ProgramTab,
} from "../../../types";
import { getProgramDisplayState } from "../domain";

const time = (value: ISODateTime): number => Date.parse(value);

export function getProgramDisplayStatus(
  program: Program,
  record: ProgramRecord | null,
  now: ISODateTime = new Date().toISOString(),
  confirmedParticipants = 0,
): ProgramDisplayStatus {
  return getProgramDisplayState({
    program,
    record,
    confirmedParticipants,
    now,
  });
}

export function getProgramTabs(program: Program): ProgramTab[] {
  return program.status === "COMPLETED"
    ? ["INFO", "RECORD", "TALK"]
    : ["INFO", "TALK", "PEOPLE"];
}

export function getParticipantCounts(
  participations: readonly Participation[],
): ParticipantCounts {
  const counts: ParticipantCounts = {
    confirmed: 0,
    waitlist: 0,
    applied: 0,
    cancelled: 0,
  };
  for (const participation of participations) {
    if (participation.status === "CONFIRMED") counts.confirmed += 1;
    if (participation.status === "WAITLIST") counts.waitlist += 1;
    if (participation.status === "APPLIED") counts.applied += 1;
    if (participation.status === "CANCELLED") counts.cancelled += 1;
  }
  return counts;
}

export function buildProgramSnapshot(
  program: Program,
  users: readonly MemberDirectoryEntry[],
  participations: readonly Participation[],
  records: readonly ProgramRecord[],
  now: ISODateTime = new Date().toISOString(),
): ProgramSnapshot {
  const programParticipations = participations.filter(
    (participation) => participation.programId === program.id,
  );
  const record =
    records.find((candidate) => candidate.programId === program.id) ?? null;
  const participantCounts = getParticipantCounts(programParticipations);
  return {
    program,
    host: users.find((user) => user.id === program.hostId) ?? null,
    participantCounts,
    record,
    displayStatus: getProgramDisplayStatus(
      program,
      record,
      now,
      participantCounts.confirmed,
    ),
  };
}

function matchesFilter(program: Program, filter: ProgramFilter): boolean {
  if (filter.type && program.type !== filter.type) return false;
  if (filter.status && program.status !== filter.status) return false;
  if (
    filter.category &&
    (program.type !== "GATHERING" || program.detail.category !== filter.category)
  ) {
    return false;
  }
  if (filter.from && time(program.endAt ?? program.startAt) < time(filter.from)) {
    return false;
  }
  if (filter.to && time(program.startAt) > time(filter.to)) return false;
  return program.status !== "DRAFT";
}

export function selectPrograms(
  programs: readonly Program[],
  users: readonly MemberDirectoryEntry[],
  participations: readonly Participation[],
  records: readonly ProgramRecord[],
  filter: ProgramFilter = {},
  now: ISODateTime = new Date().toISOString(),
): ProgramSnapshot[] {
  return programs
    .filter((program) => matchesFilter(program, filter))
    .sort((left, right) => time(left.startAt) - time(right.startAt))
    .map((program) =>
      buildProgramSnapshot(program, users, participations, records, now),
    );
}

export function selectHomeData(
  programs: readonly Program[],
  users: readonly MemberDirectoryEntry[],
  participations: readonly Participation[],
  records: readonly ProgramRecord[],
  now: ISODateTime = new Date().toISOString(),
): HomeData {
  const snapshots = selectPrograms(
    programs,
    users,
    participations,
    records,
    {},
    now,
  );
  const next =
    snapshots.find(
      ({ program }) =>
        program.status !== "CANCELLED" &&
        program.status !== "COMPLETED" &&
        time(program.startAt) >= time(now),
    ) ?? null;
  const open = snapshots.filter(
    ({ program }) =>
      program.status === "OPEN" && time(program.endAt ?? program.startAt) >= time(now),
  );
  const recentRecords = [...records]
    .sort((left, right) => time(right.createdAt) - time(left.createdAt))
    .flatMap((record) => {
      const program = programs.find((candidate) => candidate.id === record.programId);
      return program ? [{ record, program }] : [];
    })
    .slice(0, 3);
  return { next, open, recentRecords };
}

export function selectCalendarPrograms(
  programs: readonly Program[],
  users: readonly MemberDirectoryEntry[],
  participations: readonly Participation[],
  records: readonly ProgramRecord[],
  from: ISODateTime,
  to: ISODateTime,
  now: ISODateTime = new Date().toISOString(),
  scope: CalendarScope = "ALL",
  viewerId: string | null = null,
): ProgramSnapshot[] {
  const snapshots = selectPrograms(
    programs,
    users,
    participations,
    records,
    { from, to },
    now,
  );
  if (scope === "ALL") return snapshots;
  if (viewerId === null) return [];

  const participatingProgramIds = new Set(
    participations
      .filter(
        (participation) =>
          participation.userId === viewerId &&
          participation.status === "CONFIRMED",
      )
      .map((participation) => participation.programId),
  );

  return snapshots.filter(
    ({ program }) =>
      program.hostId === viewerId || participatingProgramIds.has(program.id),
  );
}

function buildApprovalSnapshot(
  approval: ProgramApproval,
  programs: readonly Program[],
  users: readonly MemberDirectoryEntry[],
  participations: readonly Participation[],
  records: readonly ProgramRecord[],
  now: ISODateTime,
): ProgramApprovalSnapshot | null {
  const program = programs.find((candidate) => candidate.id === approval.programId);
  if (!program) return null;
  return {
    approval,
    snapshot: buildProgramSnapshot(program, users, participations, records, now),
  };
}

export function selectMyProposals(
  programs: readonly Program[],
  approvals: readonly ProgramApproval[],
  users: readonly MemberDirectoryEntry[],
  participations: readonly Participation[],
  records: readonly ProgramRecord[],
  requesterId: string,
  now: ISODateTime = new Date().toISOString(),
): ProgramApprovalSnapshot[] {
  return approvals
    .filter(
      (approval) =>
        approval.requesterId === requesterId && approval.status !== "NOT_REQUIRED",
    )
    .sort(
      (left, right) =>
        time(right.requestedAt ?? "1970-01-01T00:00:00.000Z") -
        time(left.requestedAt ?? "1970-01-01T00:00:00.000Z"),
    )
    .flatMap((approval) => {
      const item = buildApprovalSnapshot(
        approval,
        programs,
        users,
        participations,
        records,
        now,
      );
      return item ? [item] : [];
    });
}

export function selectApprovalQueue(
  programs: readonly Program[],
  approvals: readonly ProgramApproval[],
  users: readonly MemberDirectoryEntry[],
  participations: readonly Participation[],
  records: readonly ProgramRecord[],
  statuses: readonly ApprovalStatus[] = ["PENDING"],
  now: ISODateTime = new Date().toISOString(),
): ProgramApprovalSnapshot[] {
  const includedStatuses = new Set(statuses);
  return approvals
    .filter((approval) => includedStatuses.has(approval.status))
    .sort(
      (left, right) =>
        time(left.requestedAt ?? "1970-01-01T00:00:00.000Z") -
        time(right.requestedAt ?? "1970-01-01T00:00:00.000Z"),
    )
    .flatMap((approval) => {
      const item = buildApprovalSnapshot(
        approval,
        programs,
        users,
        participations,
        records,
        now,
      );
      return item ? [item] : [];
    });
}

export function selectMyUpcoming(
  programs: readonly Program[],
  users: readonly MemberDirectoryEntry[],
  participations: readonly Participation[],
  records: readonly ProgramRecord[],
  userId: string,
  now: ISODateTime = new Date().toISOString(),
): ProgramSnapshot[] {
  const programIds = new Set(
    participations
      .filter(
        (participation) =>
          participation.userId === userId && participation.status === "CONFIRMED",
      )
      .map((participation) => participation.programId),
  );
  return selectPrograms(programs, users, participations, records, {}, now).filter(
    ({ program }) =>
      programIds.has(program.id) &&
      program.status !== "CANCELLED" &&
      program.status !== "COMPLETED" &&
      time(program.endAt ?? program.startAt) >= time(now),
  );
}

export function selectHostedPrograms(
  programs: readonly Program[],
  users: readonly MemberDirectoryEntry[],
  participations: readonly Participation[],
  records: readonly ProgramRecord[],
  userId: string,
  now: ISODateTime = new Date().toISOString(),
): ProgramSnapshot[] {
  return selectPrograms(programs, users, participations, records, {}, now).filter(
    ({ program }) => program.hostId === userId,
  );
}
