import type { ReactNode } from "react";

export interface ProgramMetaItem {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}
export interface ProgramMetaProps {
  items: ProgramMetaItem[];
}

export function ProgramMeta({ items }: ProgramMetaProps) {
  return (
    <dl className="grid grid-cols-2 border-t border-[var(--oa-line)] md:grid-cols-4">
      {items.map((item) => (
        <div className="border-b border-[var(--oa-line)] py-4 pr-4 md:border-b-0" key={item.label}>
          <dt className="text-[length:var(--oa-type-meta)] font-bold tracking-[var(--oa-tracking-label)] text-[var(--oa-secondary)]">{item.label}</dt>
          <dd className="mb-0 ml-0 mt-3 whitespace-pre-line text-sm leading-snug tabular-nums">{item.value}</dd>
          {item.detail ? <dd className="mb-0 ml-0 mt-2 text-xs text-[var(--oa-secondary)]">{item.detail}</dd> : null}
        </div>
      ))}
    </dl>
  );
}
