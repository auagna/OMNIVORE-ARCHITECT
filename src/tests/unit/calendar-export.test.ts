import { describe, expect, it } from "vitest";

import {
  buildGoogleCalendarUrl,
  buildIcs,
  calendarFileName,
  escapeIcsText,
} from "@/lib/calendar-export";
import { createMockRepositoryState, MOCK_PROGRAM_IDS } from "@/lib/repositories";
import type { GatheringProgram } from "@/types";

function exhibition(): GatheringProgram {
  const program = createMockRepositoryState().programs.find(
    (candidate) => candidate.id === MOCK_PROGRAM_IDS.exhibition,
  );
  if (!program || program.type !== "GATHERING") {
    throw new Error("Missing exhibition Gathering fixture");
  }
  return program;
}

describe("calendar export", () => {
  it("escapes reserved ICS characters and line breaks", () => {
    expect(escapeIcsText("A\\B; C, D\n둘째 줄")).toBe("A\\\\B\\; C\\, D\\n둘째 줄");
  });

  it("builds a Google Calendar template with UTC dates and Program context", () => {
    const program = exhibition();
    const programUrl = "https://omnivore-architect.vercel.app/program/program-gathering-028";
    const url = new URL(buildGoogleCalendarUrl(program, programUrl));

    expect(url.origin).toBe("https://calendar.google.com");
    expect(url.pathname).toBe("/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe(program.title);
    expect(url.searchParams.get("dates")).toBe("20260822T050000Z/20260822T080000Z");
    expect(url.searchParams.get("location")).toBe("리움미술관");
    expect(url.searchParams.get("details")).toContain("MEETING POINT: 13:50 / 1층 로비");
    expect(url.searchParams.get("details")).toContain(program.description);
    expect(url.searchParams.get("details")).toContain(programUrl);
  });

  it("builds a deterministic CRLF ICS event and safe filename", () => {
    const program = exhibition();
    const programUrl = "https://omnivore-architect.vercel.app/program/program-gathering-028";
    const ics = buildIcs(program, programUrl, "2026-08-18T01:02:03.000Z");

    expect(ics).toContain("PRODID:-//OMNIVORE ARCHITECT//PROGRAM//KO\r\n");
    expect(ics).toContain("X-WR-TIMEZONE:Asia/Seoul\r\n");
    expect(ics).toContain("DTSTAMP:20260818T010203Z\r\n");
    expect(ics).toContain("DTSTART:20260822T050000Z\r\n");
    expect(ics).toContain("DTEND:20260822T080000Z\r\n");
    expect(ics).toContain("SUMMARY:리움 전시 같이 보기\r\n");
    expect(ics).toContain("MEETING POINT: 13:50 / 1층 로비\\n\\n");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(calendarFileName(program)).toBe("oa-g028.ics");
  });

  it("omits DTEND for an open-ended Program", () => {
    const program = { ...exhibition(), endAt: null };
    const ics = buildIcs(program, "https://example.com/program", "2026-08-18T00:00:00.000Z");
    const google = new URL(buildGoogleCalendarUrl(program, "https://example.com/program"));

    expect(ics).not.toContain("DTEND:");
    expect(google.searchParams.get("dates")).toBe("20260822T050000Z/20260822T050000Z");
  });
});
