"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SegmentedControl } from "@/components/ui";
import { useAppState, useRepositoryQuery } from "@/features/app-state/app-state-provider";
import { CalendarAgenda } from "@/features/programs/components/calendar-agenda";
import { MonthCalendar } from "@/features/programs/components/month-calendar";
import { normalizeCalendarDate } from "@/features/programs/model/month-grid";
import { QueryError, QueryLoading } from "@/features/programs/views/query-state";
import { currentMonth, getMonthRange, shiftMonth, toInputDate } from "@/lib/format";
import type { OARepository } from "@/lib/repositories";
import type { CalendarScope } from "@/types";

function normalizedMonth(value: string | null): string {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : currentMonth();
}

export default function CalendarPage() {
  const searchParams = useSearchParams();
  const { currentUserId, sessionLoading } = useAppState();
  const month = normalizedMonth(searchParams.get("month"));
  const scope: CalendarScope = searchParams.get("scope")?.toLowerCase() === "mine" ? "MINE" : "ALL";
  const today = toInputDate(new Date().toISOString());
  const selectedDate = normalizeCalendarDate(month, searchParams.get("date"), today);
  const query = (repository: OARepository) => {
    const range = getMonthRange(month);
    return repository.listCalendarPrograms(
      range.from,
      range.to,
      new Date().toISOString(),
      scope,
      currentUserId,
    );
  };
  const { data, loading, error, reload } = useRepositoryQuery(query, [month, scope, currentUserId]);
  const agendaPrograms = (data ?? []).filter(
    ({ program }) => toInputDate(program.startAt) === selectedDate,
  );

  const [year, monthNumber] = month.split("-");
  const monthName = new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" })
    .format(new Date(Date.UTC(Number(year), Number(monthNumber) - 1, 1)))
    .toUpperCase();

  return (
    <main className="oa-page oa-page--wide">
      <header className="oa-page-head">
        <p className="oa-overline">OA / CALENDAR</p>
        <h1 className="oa-page-title oa-page-title--system">CALENDAR</h1>
      </header>

      <div className="oa-calendar-head">
        <Link href={`/calendar?month=${shiftMonth(month, -1)}&scope=${scope.toLowerCase()}`} aria-label="Previous month">←</Link>
        <h2>{monthName} <span className="oa-muted">{year}</span></h2>
        <Link href={`/calendar?month=${shiftMonth(month, 1)}&scope=${scope.toLowerCase()}`} aria-label="Next month">→</Link>
      </div>

      <Link
        className="oa-calendar-today"
        href={`/calendar?month=${today.slice(0, 7)}&scope=${scope.toLowerCase()}&date=${today}`}
        aria-label="Today"
      >
        TODAY
      </Link>

      <SegmentedControl
        className="oa-calendar-scope"
        label="Calendar scope"
        items={[
          { label: "ALL", href: `/calendar?month=${month}&scope=all&date=${selectedDate}`, active: scope === "ALL" },
          {
            label: "MINE",
            href: `/calendar?month=${month}&scope=mine&date=${selectedDate}`,
            active: scope === "MINE",
            disabled: !sessionLoading && !currentUserId,
          },
        ]}
      />

      {loading || sessionLoading ? <QueryLoading /> : null}
      {error ? <QueryError message={error.message} onRetry={reload} /> : null}
      {data && !sessionLoading ? (
        <>
          <MonthCalendar
            key={`${month}-${scope}`}
            month={month}
            selectedDate={selectedDate}
            scope={scope}
            programs={data}
            today={today}
          />
          <CalendarAgenda key={selectedDate} date={selectedDate} programs={agendaPrograms} />
        </>
      ) : null}
    </main>
  );
}
