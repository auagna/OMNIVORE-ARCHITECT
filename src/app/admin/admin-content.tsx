"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, type FormEvent } from "react";
import { PAGE_CONTENT_KEYS } from "@/constants";
import { useAppState, useRepositoryQuery } from "@/features/app-state/app-state-provider";
import type { OARepository } from "@/lib/repositories";
import type { PageContent, PageContentKey, UpdatePageContentInput } from "@/types";
import { AdminError, AdminLoading, AdminPageHeader, AdminState } from "./admin-ui";

export function isPageContentKey(value: string | null): value is PageContentKey {
  return PAGE_CONTENT_KEYS.some((key) => key === value);
}

function AdminContentForm({
  current,
  repository,
  currentUserId,
}: {
  current: PageContent;
  repository: OARepository;
  currentUserId: string | null;
}) {
  const [values, setValues] = useState<UpdatePageContentInput>(() => ({
    title: current.title,
    headline: current.headline,
    description: current.description,
    emptyState: current.emptyState,
  }));
  const [pending, setPending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function update<K extends keyof UpdatePageContentInput>(key: K, value: UpdatePageContentInput[K]) {
    setValues((previous) => ({ ...previous, [key]: value }));
    setSaveError(null);
    setSaved(false);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !currentUserId) return;
    if (!values.title.trim()) {
      setSaveError("DISPLAY TITLE을 입력해 주세요.");
      return;
    }
    setPending(true);
    setSaveError(null);
    setSaved(false);
    try {
      await repository.updatePageContent(
        current.key,
        {
          title: values.title.trim(),
          headline: values.headline.trim(),
          description: values.description.trim(),
          emptyState: values.emptyState.trim(),
        },
        currentUserId,
        new Date().toISOString(),
      );
      setSaved(true);
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : "콘텐츠를 저장하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="oa-admin-content-form" onSubmit={save} noValidate>
      <div className="oa-admin-key-field">
        <span>SYSTEM KEY</span>
        <strong>{current.key}</strong>
        <small>IMMUTABLE</small>
      </div>
      <label htmlFor="content-title">DISPLAY TITLE</label>
      <input id="content-title" value={values.title} onChange={(event) => update("title", event.target.value)} required />

      <label htmlFor="content-headline">HEADLINE</label>
      <textarea id="content-headline" rows={3} value={values.headline} onChange={(event) => update("headline", event.target.value)} />

      <label htmlFor="content-description">DESCRIPTION / EDITORIAL INTRO</label>
      <textarea id="content-description" rows={6} value={values.description} onChange={(event) => update("description", event.target.value)} />

      <label htmlFor="content-empty-state">EMPTY STATE</label>
      <textarea id="content-empty-state" rows={3} value={values.emptyState} onChange={(event) => update("emptyState", event.target.value)} />

      {saveError ? <p className="oa-admin-field-error" role="alert">{saveError}</p> : null}
      {saved ? <p className="oa-admin-save-status" role="status">SAVED / MEMBER VIEW UPDATED</p> : null}
      <div className="oa-admin-content-footer">
        <p>LAST UPDATED<br /><span>{new Date(current.updatedAt).toLocaleString("ko-KR")}</span></p>
        <button className="oa-admin-primary-button" type="submit" disabled={pending || !currentUserId}>
          {pending ? "SAVING…" : "SAVE →"}
        </button>
      </div>
    </form>
  );
}

export function AdminContentEditor({ selectedKey }: { selectedKey: PageContentKey }) {
  const { repository, currentUserId } = useAppState();
  const query = useCallback((repo: OARepository) => repo.listPageContents(), []);
  const { data, loading, error, reload } = useRepositoryQuery(query);
  const current = useMemo(
    () => data?.find((item) => item.key === selectedKey) ?? null,
    [data, selectedKey],
  );

  return (
    <main className="oa-admin-page">
      <AdminPageHeader
        eyebrow="OA / ADMIN / CONTENT"
        title="CONTENT"
        description="시스템 key와 권한 label은 유지하고, 멤버에게 보이는 editorial copy만 편집합니다."
      />
      <nav className="oa-admin-content-nav" aria-label="Editable page content">
        {PAGE_CONTENT_KEYS.map((key) => (
          <Link
            href={`/admin?view=content&key=${key}`}
            key={key}
            aria-current={selectedKey === key ? "page" : undefined}
          >
            {key.toUpperCase()}
          </Link>
        ))}
      </nav>
      {loading ? <AdminLoading label="페이지 콘텐츠를 불러오는 중입니다." /> : null}
      {error ? <AdminError message={error.message} onRetry={reload} /> : null}
      {data && !current ? (
        <AdminState label="CONTENT" title="CONTENT NOT FOUND" description="선택한 system key의 PageContent가 없습니다." />
      ) : null}
      {current ? (
        <AdminContentForm
          key={current.key}
          current={current}
          repository={repository}
          currentUserId={currentUserId}
        />
      ) : null}
    </main>
  );
}
