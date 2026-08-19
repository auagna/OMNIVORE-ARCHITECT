import { classNames } from "@/components/ui/class-names";

export interface ProgramStatusProps {
  status: string;
  className?: string;
}

const statusLabels: Record<string, string> = {
  DRAFT: "DRAFT",
  OPEN: "OPEN",
  CLOSED: "CLOSED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  HAPPENING: "HAPPENING",
  RECORD_REQUIRED: "RECORD REQUIRED",
};

export function ProgramStatus({ status, className }: ProgramStatusProps) {
  const normalized = status.toUpperCase().replaceAll(" ", "_");
  const label = statusLabels[normalized] ?? normalized.replaceAll("_", " ");

  return (
    <span
      className={classNames(
        "inline-flex items-center gap-2 font-mono text-[length:var(--oa-type-meta)] font-semibold tracking-[var(--oa-tracking-meta)] text-[var(--oa-secondary)]",
        className,
      )}
      aria-label={"Program status: " + label}
    >
      <span className="h-1.5 w-1.5 bg-current" aria-hidden="true" />
      {label}
    </span>
  );
}
