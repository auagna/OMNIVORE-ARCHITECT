import type { ComponentPropsWithoutRef } from "react";

export interface DividerProps extends ComponentPropsWithoutRef<"hr"> { strong?: boolean; }

export function Divider({ strong, className = "", ...props }: DividerProps) {
  return <hr className={"m-0 h-0 border-0 border-t " + (strong ? "border-[var(--oa-ink)] " : "border-[var(--oa-line)] ") + className} {...props} />;
}
