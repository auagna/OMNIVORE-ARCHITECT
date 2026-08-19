"use client";

import type { ReactNode } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";

export function QueryLoading({ label = "프로그램을 불러오는 중입니다." }: { label?: string }) {
  return <LoadingState label={label} rows={3} />;
}

export function QueryError({
  message,
  title = "불러오지 못했습니다.",
  retry = true,
  action,
  onRetry,
}: {
  message: string;
  title?: string;
  retry?: boolean;
  action?: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <ErrorState
      title={title}
      description={message}
      action={action}
      onRetry={retry && !action ? onRetry ?? (() => window.location.reload()) : undefined}
    />
  );
}

export function QueryEmpty({ title, description }: { title: string; description: string }) {
  return <EmptyState title={title} description={description} />;
}
