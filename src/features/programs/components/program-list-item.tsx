import Link from "next/link";
import { ProgramStatus } from "./program-status";

export interface ProgramListItemProps {
  href: string;
  title: string;
  type: string;
  category?: string | null;
  dateLabel: string;
  timeLabel?: string;
  location?: string;
  status?: string;
  code?: string;
  participantCount?: number;
  capacity?: number | null;
  actionLabel?: string;
}

function typeLabel(type: string, category?: string | null) {
  const typeText = type.replaceAll("_", " ");
  return category ? typeText + " / " + category.replaceAll("_", " ") : typeText;
}

export function ProgramListItem({
  href,
  title,
  type,
  category,
  dateLabel,
  timeLabel,
  location,
  status,
  code,
  participantCount,
  capacity,
  actionLabel = "VIEW",
}: ProgramListItemProps) {
  const hasPeople = participantCount !== undefined && capacity != null;

  return (
    <article className="border-t border-[var(--oa-line)] first:border-t-[var(--oa-ink)]">
      <Link
        className="group grid min-h-44 grid-cols-1 gap-7 py-5 no-underline md:grid-cols-[11rem_minmax(0,1fr)_11rem] md:gap-8 md:py-7"
        href={href}
      >
        <div className="flex items-start justify-between gap-5 md:block">
          <p className="m-0 text-[length:var(--oa-type-meta)] font-bold tracking-[var(--oa-tracking-label)]">{typeLabel(type, category)}</p>
          <p className="m-0 font-mono text-[length:var(--oa-type-meta)] tracking-[var(--oa-tracking-meta)] text-[var(--oa-secondary)] md:mt-3">
            {code}
          </p>
        </div>

        <div>
          <p className="m-0 max-w-[19ch] whitespace-pre-line text-[clamp(1.65rem,6.5vw,2.8rem)] font-medium leading-[1.06] tracking-[-0.025em] [word-break:keep-all] group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4">
            {title}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[length:var(--oa-type-meta)] tracking-[var(--oa-tracking-meta)] text-[var(--oa-secondary)] tabular-nums">
            {timeLabel ? <span>{timeLabel}</span> : null}
            {location ? <span>{location}</span> : null}
            {status ? <ProgramStatus status={status} /> : null}
          </div>
        </div>

        <div className="flex items-end justify-between gap-5 md:flex-col md:items-end md:justify-between">
          <time className="text-right font-mono text-sm font-semibold tracking-[-0.02em]">{dateLabel}</time>
          <div className="flex items-center gap-5">
            {hasPeople ? (
              <span className="font-mono text-xs text-[var(--oa-secondary)]">
                {String(participantCount).padStart(2, "0")} / {String(capacity).padStart(2, "0")}
              </span>
            ) : null}
            <span className="text-[length:var(--oa-type-label)] font-bold tracking-[var(--oa-tracking-label)]">{actionLabel} →</span>
          </div>
        </div>
      </Link>
    </article>
  );
}
