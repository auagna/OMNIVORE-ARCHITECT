export interface CostInfoProps {
  costType: string;
  amount?: string | null;
  note?: string | null;
  purchaseUrl?: string | null;
}

const costLabels: Record<string, string> = {
  FREE: "FREE",
  INDIVIDUAL_PURCHASE: "INDIVIDUAL PURCHASE",
  HOST_COLLECT: "HOST COLLECT",
};

export function CostInfo({ costType, amount, note, purchaseUrl }: CostInfoProps) {
  const normalized = costType.toUpperCase();
  const label = costLabels[normalized] ?? normalized.replaceAll("_", " ");

  return (
    <div>
      <p className="m-0 text-[length:var(--oa-type-meta)] font-bold tracking-[var(--oa-tracking-label)] text-[var(--oa-secondary)]">COST</p>
      <p className="mb-0 mt-3 font-mono text-base">{label}{amount ? " / " + amount : ""}</p>
      {note ? <p className="mb-0 mt-3 max-w-[34rem] text-sm leading-relaxed text-[var(--oa-secondary)]">{note}</p> : null}
      {purchaseUrl ? (
        <a className="mt-4 inline-flex min-h-11 items-center text-[length:var(--oa-type-label)] font-bold tracking-[var(--oa-tracking-label)]" href={purchaseUrl} target="_blank" rel="noreferrer">
          PURCHASE INFORMATION&nbsp; →
        </a>
      ) : null}
    </div>
  );
}
