import Link from "next/link";
import { formatProgramKind, formatShortDate, formatTime } from "@/lib/format";
import type { ProgramSnapshot } from "@/types";

export function ProgramEditorialLink({
  snapshot,
  action,
  headingLevel = "h3",
}: {
  snapshot: ProgramSnapshot;
  action?: string;
  headingLevel?: "h2" | "h3";
}) {
  const { program, participantCounts, displayStatus } = snapshot;
  const Heading = headingLevel;
  const resolvedAction = action ?? "VIEW →";

  return (
    <article className="oa-editorial-item">
      <Link className="oa-editorial-link" href={`/program/${program.id}`}>
        <div>
          <p className="oa-overline">
            {formatProgramKind(program)} <span className="oa-muted">/ {displayStatus.replaceAll("_", " ")}</span>
          </p>
          <Heading className="oa-item-title">{program.title}</Heading>
          <p className="oa-meta oa-muted">
            {formatTime(program.startAt)} · {program.location}
          </p>
        </div>
        <div className="oa-item-side">
          <p className="oa-meta oa-mono">{formatShortDate(program.startAt)}</p>
          {program.capacity !== null ? (
            <p className="oa-meta oa-muted oa-mono">
              {String(participantCounts.confirmed).padStart(2, "0")} / {String(program.capacity).padStart(2, "0")}
            </p>
          ) : null}
          <p className="oa-item-action">{resolvedAction}</p>
        </div>
      </Link>
    </article>
  );
}

export function ProgramEditorialList({
  programs,
  headingLevel = "h2",
}: {
  programs: ProgramSnapshot[];
  headingLevel?: "h2" | "h3";
}) {
  return (
    <div className="oa-editorial-list">
      {programs.map((program) => (
        <ProgramEditorialLink key={program.program.id} snapshot={program} headingLevel={headingLevel} />
      ))}
    </div>
  );
}
