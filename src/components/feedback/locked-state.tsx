import type { ReactNode } from "react";

export interface LockedStateProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  headingLevel?: "h2" | "h3";
}

export function LockedState({
  title = "PARTICIPANTS ONLY",
  description = "이 대화방은 참가자와 운영진만 이용할 수 있습니다.",
  action,
  headingLevel = "h2",
}: LockedStateProps) {
  const Heading = headingLevel;

  return (
    <section className="border-y border-[var(--oa-ink)] py-12" aria-labelledby="locked-state-title">
      <p className="m-0 text-[length:var(--oa-type-meta)] font-bold tracking-[var(--oa-tracking-label)] text-[var(--oa-secondary)]">TALK</p>
      <Heading className="mb-0 mt-8 max-w-[16ch] text-3xl font-medium leading-[1.08] tracking-[-0.025em]" id="locked-state-title">
        {title}
      </Heading>
      <p className="mb-0 mt-5 max-w-[34rem] whitespace-pre-line text-base leading-relaxed text-[var(--oa-secondary)]">
        {description}
      </p>
      {action ? <div className="mt-8">{action}</div> : null}
    </section>
  );
}
