import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";
import { classNames } from "./class-names";

export type ArrowLinkProps = ComponentPropsWithoutRef<typeof Link>;

export function ArrowLink({ className, children, ...props }: ArrowLinkProps) {
  return (
    <Link
      className={classNames(
        "inline-flex min-h-11 items-center gap-3 border-b border-transparent py-2 text-[length:var(--oa-type-label)] font-bold tracking-[var(--oa-tracking-label)] no-underline hover:border-[var(--oa-ink)]",
        className,
      )}
      {...props}
    >
      <span>{children}</span><span aria-hidden="true">→</span>
    </Link>
  );
}
