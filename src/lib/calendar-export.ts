import type { Program } from "@/types";

function compactUtc(value: string): string {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function escapeIcsText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replace(/\r?\n/g, "\\n");
}

function meetingPoint(program: Program): string | null {
  return program.type === "GATHERING" ? program.detail.meetingPoint : null;
}

function calendarDescription(program: Program, programUrl: string): string {
  const meet = meetingPoint(program);
  return [meet ? `MEETING POINT: ${meet}` : null, program.description, programUrl]
    .filter((value): value is string => Boolean(value))
    .join("\n\n");
}

export function buildGoogleCalendarUrl(program: Program, programUrl: string): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: program.title,
    dates: `${compactUtc(program.startAt)}/${compactUtc(program.endAt ?? program.startAt)}`,
    location: program.location,
    details: calendarDescription(program, programUrl),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildIcs(program: Program, programUrl: string, generatedAt = new Date().toISOString()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OMNIVORE ARCHITECT//PROGRAM//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-TIMEZONE:Asia/Seoul",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(`${program.id}@omnivorearchitect`)}`,
    `DTSTAMP:${compactUtc(generatedAt)}`,
    `DTSTART:${compactUtc(program.startAt)}`,
    ...(program.endAt ? [`DTEND:${compactUtc(program.endAt)}`] : []),
    `SUMMARY:${escapeIcsText(program.title)}`,
    `LOCATION:${escapeIcsText(program.location)}`,
    `DESCRIPTION:${escapeIcsText(calendarDescription(program, programUrl))}`,
    `URL:${escapeIcsText(programUrl)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.join("\r\n")}\r\n`;
}

export function calendarFileName(program: Program): string {
  const code = program.code.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  return `${code || "oa-program"}.ics`;
}
