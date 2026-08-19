import type { HTMLAttributes } from "react";

export type OAMiniLogoProps = Omit<HTMLAttributes<HTMLSpanElement>, "children">;

export function OAMiniLogo({ className = "", ...props }: OAMiniLogoProps) {
  return (
    <span
      aria-hidden="true"
      className={`oa-mini-logo ${className}`.trim()}
      {...props}
    />
  );
}
