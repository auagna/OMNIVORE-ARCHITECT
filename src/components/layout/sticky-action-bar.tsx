import type { ComponentPropsWithoutRef } from "react";

export type StickyActionBarProps = ComponentPropsWithoutRef<"aside">;

export function StickyActionBar({ className = "", children, ...props }: StickyActionBarProps) {
  return (
    <aside
      className={"sticky bottom-[calc(var(--oa-nav-height)+12px)] z-30 -mx-2 mt-9 flex min-h-[60px] gap-2 border border-[var(--oa-line)] bg-[color-mix(in_srgb,var(--oa-paper)_94%,transparent)] p-2 backdrop-blur-md lg:bottom-5 " + className}
      aria-label="Page actions"
      {...props}
    >
      {children}
    </aside>
  );
}
