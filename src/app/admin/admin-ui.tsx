"use client";

import type { ReactNode } from "react";

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="oa-admin-page-head">
      <div>
        <p className="oa-admin-kicker">{eyebrow}</p>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="oa-admin-head-action">{action}</div> : null}
    </header>
  );
}

export function AdminState({
  label,
  title,
  description,
  action,
}: {
  label: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  const id = `admin-state-${label.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <section className="oa-admin-state" aria-labelledby={id}>
      <p className="oa-admin-kicker">{label}</p>
      <h2 id={id}>{title}</h2>
      <p>{description}</p>
      {action ? <div>{action}</div> : null}
    </section>
  );
}

export function AdminLoading({ label = "업무 데이터를 불러오는 중입니다." }: { label?: string }) {
  return <div className="oa-admin-loading" role="status" aria-live="polite">{label}</div>;
}

export function AdminError({
  message,
  onRetry,
  retry = true,
}: {
  message: string;
  onRetry?: () => void;
  retry?: boolean;
}) {
  return (
    <div className="oa-admin-error" role="alert">
      <strong>DATA ERROR</strong>
      <span>{message}</span>
      {retry ? <button type="button" onClick={onRetry ?? (() => window.location.reload())}>RETRY →</button> : null}
    </div>
  );
}
