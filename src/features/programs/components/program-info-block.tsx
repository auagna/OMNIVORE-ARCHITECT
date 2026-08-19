import type { ReactNode } from "react";

export interface ProgramInfoBlockProps {
  label: string;
  children: ReactNode;
  aside?: ReactNode;
}

export function ProgramInfoBlock({ label, children, aside }: ProgramInfoBlockProps) {
  return (
    <section className="grid gap-5 border-t border-[var(--oa-line)] py-6 md:grid-cols-[9rem_minmax(0,1fr)_auto] md:gap-8 md:py-8">
      <h2 className="m-0 text-[length:var(--oa-type-meta)] font-bold tracking-[var(--oa-tracking-label)] text-[var(--oa-secondary)]">{label}</h2>
      <div className="max-w-[48rem] whitespace-pre-line text-[1.04rem] leading-[1.7] [word-break:keep-all]">{children}</div>
      {aside ? <div className="text-[length:var(--oa-type-label)] font-bold tracking-[var(--oa-tracking-label)]">{aside}</div> : null}
    </section>
  );
}
