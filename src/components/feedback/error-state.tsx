"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  action?: ReactNode;
  announce?: boolean;
  headingLevel?: "h2" | "h3";
}

export function ErrorState({
  title = "SOMETHING WENT WRONG",
  description = "정보를 불러오지 못했습니다. 다시 시도해 주세요.",
  onRetry,
  action,
  announce = true,
  headingLevel = "h2",
}: ErrorStateProps) {
  const Heading = headingLevel;

  return (
    <section className="border-y border-[var(--oa-ink)] py-10" role={announce ? "alert" : undefined}>
      <Heading className="m-0 text-[length:var(--oa-type-label)] font-bold tracking-[var(--oa-tracking-label)]">{title}</Heading>
      <p className="mb-0 mt-4 max-w-[34rem] leading-relaxed text-[var(--oa-secondary)]">{description}</p>
      {action ? <div className="mt-7">{action}</div> : null}
      {!action && onRetry ? <Button className="mt-7" onClick={onRetry} variant="outline">TRY AGAIN</Button> : null}
    </section>
  );
}
