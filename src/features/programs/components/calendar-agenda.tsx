import { ProgramEditorialList } from "@/features/programs/views/program-editorial-link";
import type { ProgramSnapshot } from "@/types";

function agendaDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`)).toUpperCase();
}

export function CalendarAgenda({ date, programs }: { date: string; programs: ProgramSnapshot[] }) {
  return (
    <section className="oa-calendar-agenda" aria-labelledby="calendar-agenda-heading">
      <div className="oa-section-heading">
        <h2 id="calendar-agenda-heading">{agendaDate(date)}</h2>
        <span className="oa-label">{programs.length} PROGRAM{programs.length === 1 ? "" : "S"}</span>
      </div>
      {programs.length ? (
        <ProgramEditorialList programs={programs} headingLevel="h3" />
      ) : (
        <p className="oa-empty">선택한 날짜에 예정된 Program이 없습니다.</p>
      )}
    </section>
  );
}
