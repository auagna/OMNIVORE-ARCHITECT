import { describe, expect, it } from "vitest";

import { getProgramDisplayStatus } from "@/features/programs/model";
import type { Program, ProgramRecord } from "@/types";

const now = "2026-08-08T12:00:00+09:00";

function programWith(
  values: Pick<Program, "status" | "startAt" | "endAt">,
): Program {
  return values as Program;
}

const record = {
  id: "record-027",
  programId: "program-talk-027",
  authorId: "member-host",
  what: "프로그램에서 나눈 핵심 대화를 기록했습니다.",
  found: null,
  summary: "프로그램에서 나눈 핵심 대화를 기록했습니다.",
  body: null,
  photoMediaId: null,
  linkUrl: null,
  createdAt: "2026-08-07T21:00:00+09:00",
} as ProgramRecord;

describe("getProgramDisplayStatus", () => {
  it("derives HAPPENING from the clock without persisting it as a Program status", () => {
    const program = programWith({
      status: "OPEN",
      startAt: "2026-08-08T11:00:00+09:00",
      endAt: "2026-08-08T13:00:00+09:00",
    });

    expect(getProgramDisplayStatus(program, null, now)).toBe("HAPPENING");
    expect(program.status).toBe("OPEN");
  });

  it("shows RECORD_REQUIRED for a completed Program without a Record", () => {
    const program = programWith({
      status: "COMPLETED",
      startAt: "2026-08-01T14:00:00+09:00",
      endAt: "2026-08-01T17:00:00+09:00",
    });

    expect(getProgramDisplayStatus(program, null, now)).toBe("RECORD_REQUIRED");
  });

  it("returns COMPLETED once the Record exists", () => {
    const program = programWith({
      status: "COMPLETED",
      startAt: "2026-08-01T14:00:00+09:00",
      endAt: "2026-08-01T17:00:00+09:00",
    });

    expect(getProgramDisplayStatus(program, record, now)).toBe("COMPLETED");
  });

  it("shows FULL when confirmed participants reach capacity", () => {
    const program = {
      ...programWith({
        status: "OPEN",
        startAt: "2026-08-22T14:00:00+09:00",
        endAt: "2026-08-22T17:00:00+09:00",
      }),
      capacity: 8,
    } as Program;

    expect(getProgramDisplayStatus(program, null, now, 8)).toBe("FULL");
  });

  it("shows RECRUITING for an OPEN Program with available capacity", () => {
    const program = {
      ...programWith({
        status: "OPEN",
        startAt: "2026-08-22T14:00:00+09:00",
        endAt: "2026-08-22T17:00:00+09:00",
      }),
      capacity: 8,
    } as Program;

    expect(getProgramDisplayStatus(program, null, now, 6)).toBe("RECRUITING");
  });
});
