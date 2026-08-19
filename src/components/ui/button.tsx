import type { ButtonHTMLAttributes } from "react";
import { classNames } from "./class-names";

export type ButtonVariant = "solid" | "outline" | "text";
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  fullWidth?: boolean;
  static?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  solid: "border border-[var(--oa-ink)] bg-[var(--oa-ink)] text-[var(--oa-paper)] hover:bg-[var(--oa-charcoal)]",
  outline: "border border-[var(--oa-ink)] bg-transparent text-[var(--oa-ink)] hover:bg-[var(--oa-surface)]",
  text: "border border-transparent bg-transparent text-[var(--oa-ink)] hover:border-b-[var(--oa-ink)]",
};

export function Button({ variant = "solid", fullWidth, static: isStatic = false, className, type = "button", children, ...props }: ButtonProps) {
  return (
    <button
      className={classNames(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-none px-4 py-3 text-[length:var(--oa-type-label)] font-bold tracking-[var(--oa-tracking-label)] disabled:cursor-not-allowed disabled:opacity-40",
        !isStatic && "oa-pressable",
        variants[variant],
        fullWidth && "w-full",
        className,
      )}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
