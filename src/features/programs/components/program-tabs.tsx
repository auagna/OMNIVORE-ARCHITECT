import Link from "next/link";
import type { Route } from "next";
import { classNames } from "@/components/ui/class-names";

export interface ProgramTabItem {
  label: string;
  href: Route;
  active?: boolean;
  count?: number;
}
export interface ProgramTabsProps {
  items: ProgramTabItem[];
  label?: string;
  className?: string;
}

export function ProgramTabs({ items, label = "Program sections", className }: ProgramTabsProps) {
  return (
    <nav className={classNames("mt-12 border-y border-[var(--oa-line)]", className)} aria-label={label}>
      <ul className="flex list-none overflow-x-auto p-0">
        {items.map((item) => (
          <li key={item.href + item.label}>
            <Link
              className={classNames(
                "flex min-h-12 min-w-24 items-center justify-center gap-2 border-b-2 px-4 text-[length:var(--oa-type-label)] font-bold tracking-[var(--oa-tracking-label)] no-underline",
                item.active ? "border-[var(--oa-ink)]" : "border-transparent text-[var(--oa-secondary)] hover:text-[var(--oa-ink)]",
              )}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
            >
              {item.label}
              {item.count !== undefined ? <span className="font-mono text-[length:var(--oa-type-meta)] text-[var(--oa-muted)]">{item.count}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
