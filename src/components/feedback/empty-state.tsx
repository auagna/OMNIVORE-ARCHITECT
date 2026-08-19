import type { ReactNode } from "react";

export interface EmptyStateProps {
  title?: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ title = "NOTHING HERE YET", description, action }: EmptyStateProps) {
  return (
    <section className="border-y border-[var(--oa-line)] py-12" aria-live="polite">
      <p className="m-0 text-[length:var(--oa-type-meta)] font-bold tracking-[var(--oa-tracking-label)] text-[var(--oa-secondary)]">{title}</p>
      <p className="mb-0 mt-5 max-w-[36rem] text-balance text-xl leading-[1.35]">{description}</p>
      {action ? <div className="mt-7">{action}</div> : null}
    </section>
  );
}
