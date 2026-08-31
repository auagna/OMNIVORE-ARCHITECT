import { describe, expect, it } from "vitest";

import { buildAdminRecordRows } from "@/app/admin/admin-data-adapter";
import { buildProgramSnapshot } from "@/features/programs/model";
import {
  createMockRepositoryState,
  MOCK_PROGRAM_IDS,
} from "@/lib/repositories/mock-data";
import type { ProgramRecord, ProgramSnapshot } from "@/types";

function snapshots(): ProgramSnapshot[] {
  const state = createMockRepositoryState();
  return state.programs.map((program) =>
    buildProgramSnapshot(
      program,
      state.users,
      state.participations,
      state.records,
      "2026-08-20T00:00:00.000Z",
    ),
  );
}

describe("Admin record rows", () => {
  it("keeps only completed or record-bearing Programs and never creates NOT DUE rows", () => {
    const state = createMockRepositoryState();
    const source = snapshots();
    const completed = source.find(
      ({ program }) => program.id === MOCK_PROGRAM_IDS.talk,
    );
    const open = source.find(
      ({ program }) => program.id === MOCK_PROGRAM_IDS.exhibition,
    );
    if (!completed || !open) throw new Error("Missing Program fixture");

    const completedWithoutRecord: ProgramSnapshot = {
      ...completed,
      program: { ...completed.program, id: "completed-without-record" },
      record: null,
      displayStatus: "RECORD_REQUIRED",
    };
    const openRecord: ProgramRecord = {
      ...state.records[0],
      id: "record-on-open-program",
      programId: open.program.id,
    };

    const rows = buildAdminRecordRows(
      [open, completedWithoutRecord],
      [openRecord],
    );

    expect(rows.map(({ snapshot }) => snapshot.program.id)).toEqual([
      completedWithoutRecord.program.id,
      open.program.id,
    ]);
    expect(rows.map(({ state: recordState }) => recordState)).toEqual([
      "REQUIRED",
      "RECORDED",
    ]);
    expect(buildAdminRecordRows([open], [])).toEqual([]);
  });
});
