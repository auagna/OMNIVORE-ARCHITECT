import type {
  ISODateTime,
  Program,
  ProgramDisplayStatus,
  ProgramRecord,
} from "../../../types";

const time = (value: ISODateTime): number => Date.parse(value);

export interface ProgramDisplayStateContext {
  program: Program;
  record: ProgramRecord | null;
  confirmedParticipants: number;
  now?: ISODateTime;
}

export function isProgramHappening(
  program: Program,
  now: ISODateTime = new Date().toISOString(),
): boolean {
  return (
    program.endAt !== null &&
    time(program.startAt) <= time(now) &&
    time(now) <= time(program.endAt)
  );
}

export function isProgramFull(
  program: Program,
  confirmedParticipants: number,
): boolean {
  return program.capacity !== null && confirmedParticipants >= program.capacity;
}

/** Derives the single primary label shown by the UI from persisted state. */
export function getProgramDisplayState({
  program,
  record,
  confirmedParticipants,
  now = new Date().toISOString(),
}: ProgramDisplayStateContext): ProgramDisplayStatus {
  if (program.status === "COMPLETED") {
    return record === null ? "RECORD_REQUIRED" : "COMPLETED";
  }
  if (program.status === "DRAFT" || program.status === "CANCELLED") {
    return program.status;
  }
  if (isProgramHappening(program, now)) return "HAPPENING";
  if (program.status === "OPEN" && isProgramFull(program, confirmedParticipants)) {
    return "FULL";
  }
  if (program.status === "OPEN") return "RECRUITING";
  return program.status;
}

export function isRecordRequired(
  program: Program,
  record: ProgramRecord | null,
): boolean {
  return program.status === "COMPLETED" && record === null;
}
