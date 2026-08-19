export interface ParticipantSummaryProps {
  current: number;
  capacity: number;
  waitlist?: number;
  label?: string;
}

export function ParticipantSummary({ current, capacity, waitlist, label = "PEOPLE" }: ParticipantSummaryProps) {
  const percentage = Math.min(100, Math.max(0, (current / Math.max(capacity, 1)) * 100));

  return (
    <div aria-label={current + " of " + capacity + " places confirmed"}>
      <div className="flex items-end justify-between gap-6">
        <span className="text-[length:var(--oa-type-meta)] font-bold tracking-[var(--oa-tracking-label)] text-[var(--oa-secondary)]">{label}</span>
        <strong className="font-mono text-2xl font-medium tracking-[-0.02em]">
          {String(current).padStart(2, "0")} / {String(capacity).padStart(2, "0")}
        </strong>
      </div>
      <div className="mt-4 h-px bg-[var(--oa-line)]" aria-hidden="true">
        <div className="h-px bg-[var(--oa-ink)]" style={{ width: percentage + "%" }} />
      </div>
      {waitlist !== undefined ? (
        <p className="mb-0 mt-3 text-right font-mono text-[length:var(--oa-type-meta)] text-[var(--oa-secondary)]">WAITLIST {waitlist}</p>
      ) : null}
    </div>
  );
}
