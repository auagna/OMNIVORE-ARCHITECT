import type { ReactNode } from "react";
import { ProgramStatus } from "./program-status";

export interface ProgramHeaderProps {
  title: string;
  type: string;
  category?: string | null;
  code?: string;
  subtitle?: string | null;
  status?: string;
  meta?: ReactNode;
  media?: ReactNode;
}

export function ProgramHeader({
  title,
  type,
  category,
  code,
  subtitle,
  status,
  meta,
  media,
}: ProgramHeaderProps) {
  const eyebrow = category
    ? type.replaceAll("_", " ") + " / " + category.replaceAll("_", " ")
    : type.replaceAll("_", " ");

  return (
    <header className="border-t border-[var(--oa-ink)] pt-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p className="m-0 text-[length:var(--oa-type-meta)] font-bold tracking-[var(--oa-tracking-label)]">{eyebrow}</p>
        <div className="flex items-center gap-4">
          {code ? <span className="font-mono text-[length:var(--oa-type-meta)] tracking-[var(--oa-tracking-meta)] text-[var(--oa-secondary)]">OA / {code}</span> : null}
          {status ? <ProgramStatus status={status} /> : null}
        </div>
      </div>
      <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.55fr)] lg:items-end">
        <div>
          {subtitle ? <p className="mb-4 mt-0 max-w-[46rem] text-base text-[var(--oa-secondary)]">{subtitle}</p> : null}
          <h1 className="m-0 max-w-[15ch] whitespace-pre-line text-[clamp(2.75rem,10.5vw,6.5rem)] font-medium leading-[0.94] tracking-[-0.035em] [word-break:keep-all]">
            {title}
          </h1>
          {meta ? <div className="mt-10">{meta}</div> : null}
        </div>
        {media ? <div className="aspect-[4/3] overflow-hidden bg-[var(--oa-surface)] [&>*]:h-full [&>*]:w-full [&>*]:object-cover">{media}</div> : null}
      </div>
    </header>
  );
}
