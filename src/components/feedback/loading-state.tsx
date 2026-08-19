export interface LoadingStateProps {
  label?: string;
  rows?: number;
}

export function LoadingState({ label = "LOADING", rows = 3 }: LoadingStateProps) {
  return (
    <div className="border-t border-[var(--oa-line)]" role="status" aria-live="polite">
      <span className="oa-visually-hidden">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div className="animate-pulse border-b border-[var(--oa-line)] py-6" key={index} aria-hidden="true">
          <div className="h-2 w-24 bg-[var(--oa-line)]" />
          <div className="mt-5 h-7 w-4/5 bg-[var(--oa-line)]" />
          <div className="mt-4 h-2 w-2/5 bg-[var(--oa-line)]" />
        </div>
      ))}
    </div>
  );
}
