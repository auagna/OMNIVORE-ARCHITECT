import { formatLongDate, formatProgramKind, formatTimeRange } from "@/lib/format";
import type { ParticipationStatus, ProgramSnapshot } from "@/types";

export interface ProgramDetailHeroProps {
  snapshot: ProgramSnapshot;
  participationStatus?: ParticipationStatus | null;
  headingLevel?: "h1" | "h3";
}

export function ProgramDetailHero({
  snapshot,
  participationStatus = null,
  headingLevel = "h1",
}: ProgramDetailHeroProps) {
  const { program } = snapshot;
  const Heading = headingLevel;

  return (
    <header className="oa-program-hero">
      <div className="oa-detail-code">
        <span className="oa-overline">{formatProgramKind(program)}</span>
        <span className="oa-overline">{program.code}</span>
      </div>
      <Heading className="oa-page-title oa-page-title--detail oa-detail-title-reveal">
        {program.title}
      </Heading>
      <p className="oa-detail-date">
        {formatLongDate(program.startAt)}
        <span>{formatTimeRange(program.startAt, program.endAt)}</span>
      </p>
      <p className="oa-status">{snapshot.displayStatus.replaceAll("_", " ")}</p>
      {participationStatus ? (
        <p className="oa-meta oa-muted">PARTICIPATION / {participationStatus}</p>
      ) : null}
    </header>
  );
}
