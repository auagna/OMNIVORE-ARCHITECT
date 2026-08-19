import Link from "next/link";
import { buildMonthGrid, programTypeMark } from "@/features/programs/model/month-grid";
import { toInputDate } from "@/lib/format";
import type { CalendarScope, ProgramSnapshot } from "@/types";

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

export function MonthCalendar({
  month,
  selectedDate,
  scope,
  programs,
  today,
}: {
  month: string;
  selectedDate: string;
  scope: CalendarScope;
  programs: ProgramSnapshot[];
  today: string;
}) {
  const monthGrid = buildMonthGrid(month, today);
  const programsByDate = new Map<string, ProgramSnapshot[]>();
  for (const snapshot of programs) {
    const date = toInputDate(snapshot.program.startAt);
    programsByDate.set(date, [...(programsByDate.get(date) ?? []), snapshot]);
  }

  return (
    <table className="oa-month-calendar">
      <caption className="oa-visually-hidden">{month} OMNIVORE ARCHITECT programs</caption>
      <thead>
        <tr>{WEEKDAYS.map((weekday) => <th scope="col" key={weekday}>{weekday}</th>)}</tr>
      </thead>
      <tbody>
        {Array.from({ length: 6 }, (_, week) => (
          <tr key={week}>
            {monthGrid.slice(week * 7, week * 7 + 7).map((day) => {
              const dayPrograms = programsByDate.get(day.date) ?? [];
              const marks = [...new Set(dayPrograms.map(({ program }) => programTypeMark(program.type)))];
              const label = new Intl.DateTimeFormat("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
                weekday: "long",
                timeZone: "UTC",
              }).format(new Date(`${day.date}T00:00:00Z`));

              return (
                <td data-outside={day.inCurrentMonth ? undefined : "true"} key={day.date}>
                  {day.inCurrentMonth ? (
                    <Link
                      className="oa-calendar-cell oa-motion-ui"
                      data-selected={day.date === selectedDate ? "true" : undefined}
                      data-today={day.isToday ? "true" : undefined}
                      href={`/calendar?month=${month}&scope=${scope.toLowerCase()}&date=${day.date}`}
                      aria-current={day.date === selectedDate ? "date" : undefined}
                      aria-label={`${label}, Program ${dayPrograms.length}개`}
                    >
                      <span className="oa-calendar-number">{day.day}</span>
                      {marks.length ? (
                        <span className="oa-calendar-marks" aria-hidden="true">
                          {marks.map((mark) => <span key={mark}>{mark}</span>)}
                        </span>
                      ) : null}
                    </Link>
                  ) : (
                    <span
                      className="oa-calendar-cell oa-calendar-cell--outside"
                      aria-hidden="true"
                    >
                      <span className="oa-calendar-number">{day.day}</span>
                    </span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
