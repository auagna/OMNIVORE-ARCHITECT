import Link from "next/link";
import { classNames } from "./class-names";

export interface SegmentItem {
  label: string;
  href: string;
  active?: boolean;
  disabled?: boolean;
}
export interface SegmentedControlProps {
  items: SegmentItem[];
  label: string;
  className?: string;
}

export function SegmentedControl({ items, label, className }: SegmentedControlProps) {
  return (
    <nav className={classNames("overflow-x-auto border-y border-[var(--oa-line)]", className)} aria-label={label}>
      <ul className="flex min-w-max list-none p-0">
        {items.map((item) => (
          <li key={item.href + item.label}>
            {item.disabled ? (
              <span className="flex min-h-11 items-center px-4 text-[length:var(--oa-type-label)] font-bold tracking-[var(--oa-tracking-label)] text-[var(--oa-muted)]" aria-disabled="true">
                {item.label}
              </span>
            ) : (
              <Link
                className={classNames(
                  "flex min-h-11 items-center border-b-2 px-4 text-[length:var(--oa-type-label)] font-bold tracking-[var(--oa-tracking-label)] no-underline",
                  item.active ? "border-[var(--oa-ink)]" : "border-transparent text-[var(--oa-secondary)] hover:text-[var(--oa-ink)]",
                )}
                href={item.href}
                aria-current={item.active ? "page" : undefined}
              >
                {item.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
