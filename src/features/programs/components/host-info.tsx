import Image from "next/image";

export interface HostInfoProps {
  name: string;
  meta?: string | null;
  imageUrl?: string | null;
}

export function HostInfo({ name, meta, imageUrl }: HostInfoProps) {
  const initials = name.trim().slice(0, 2).toUpperCase();

  return (
    <div className="flex items-center gap-4">
      <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden bg-[var(--oa-surface)] font-mono text-xs" aria-hidden="true">
        {imageUrl ? (
          <Image
            className="h-full w-full object-cover"
            src={imageUrl}
            alt=""
            width={48}
            height={48}
            unoptimized
          />
        ) : (
          initials
        )}
      </div>
      <div>
        <p className="m-0 text-[length:var(--oa-type-meta)] font-bold tracking-[var(--oa-tracking-label)] text-[var(--oa-secondary)]">HOST</p>
        <p className="mb-0 mt-1.5 text-sm font-medium">{name}{meta ? " · " + meta : ""}</p>
      </div>
    </div>
  );
}
