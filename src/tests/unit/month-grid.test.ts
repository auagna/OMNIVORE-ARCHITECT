import { describe, expect, it } from "vitest";

import {
  buildMonthGrid,
  normalizeCalendarDate,
  programTypeMark,
} from "@/features/programs/model/month-grid";

describe("month grid", () => {
  it("builds a stable six-week Sunday-first grid", () => {
    const grid = buildMonthGrid("2026-08", "2026-08-18");

    expect(grid).toHaveLength(42);
    expect(grid[0]).toMatchObject({ date: "2026-07-26", day: 26, inCurrentMonth: false });
    expect(grid[6]).toMatchObject({ date: "2026-08-01", day: 1, inCurrentMonth: true });
    expect(grid[23]).toMatchObject({ date: "2026-08-18", day: 18, isToday: true });
    expect(grid[41]).toMatchObject({ date: "2026-09-05", day: 5, inCurrentMonth: false });
    expect(grid.filter((day) => day.inCurrentMonth)).toHaveLength(31);
    expect(grid.filter((day) => day.isToday)).toHaveLength(1);
  });

  it("uses a valid selected date, otherwise today or the first of the month", () => {
    expect(normalizeCalendarDate("2026-08", "2026-08-22", "2026-08-18")).toBe("2026-08-22");
    expect(normalizeCalendarDate("2026-08", "2026-09-01", "2026-08-18")).toBe("2026-08-18");
    expect(normalizeCalendarDate("2026-08", "invalid", "2026-09-02")).toBe("2026-08-01");
    expect(normalizeCalendarDate("2026-08", null, "2026-08-18")).toBe("2026-08-18");
  });

  it("maps the three Program types to compact calendar marks", () => {
    expect(programTypeMark("TALK")).toBe("T");
    expect(programTypeMark("READING")).toBe("R");
    expect(programTypeMark("GATHERING")).toBe("G");
  });
});
