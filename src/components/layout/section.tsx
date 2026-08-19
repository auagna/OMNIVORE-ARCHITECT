import type { ComponentPropsWithoutRef, ReactNode } from "react";

export interface SectionProps extends ComponentPropsWithoutRef<"section"> {
  eyebrow?: string;
  title?: string;
  action?: ReactNode;
}

export function Section({ eyebrow, title, action, children, className = "", ...props }: SectionProps) {
  const heading = title ?? eyebrow;
  return (
    <section className={"mb-14 md:mb-16 " + className} {...props}>
      {heading || action ? (
        <div className="mb-[18px] flex min-h-9 items-start justify-between gap-4 border-b border-[var(--oa-ink)]">
          {heading ? <h2 className="m-0 pb-2.5 text-[length:var(--oa-type-section)] font-bold tracking-[var(--oa-tracking-label)]">{heading}</h2> : <span />}
          {action ? <div className="pb-2.5 text-[length:var(--oa-type-label)] font-bold tracking-[var(--oa-tracking-meta)] text-[var(--oa-secondary)]">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
