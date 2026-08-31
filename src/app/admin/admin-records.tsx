"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useAppState, useRepositoryQuery } from "@/features/app-state/app-state-provider";
import { formatLongDate, formatProgramKind } from "@/lib/format";
import type { OARepository } from "@/lib/repositories";
import { buildAdminRecordRows } from "./admin-data-adapter";
import { AdminError, AdminLoading, AdminPageHeader, AdminState } from "./admin-ui";

type RecordFilter = "ALL" | "REQUIRED" | "RECORDED";

export function AdminRecords() {
  const { currentUserId } = useAppState();
  const [filter, setFilter] = useState<RecordFilter>("ALL");
  const query = useCallback(async (repository: OARepository) => {
    if (!currentUserId) throw new Error("관리자 로그인이 필요합니다.");
    const now = new Date().toISOString();
    const [programs, records] = await Promise.all([
      repository.listAdminPrograms(currentUserId, now),
      repository.listAdminRecords(currentUserId),
    ]);
    return buildAdminRecordRows(programs, records);
  }, [currentUserId]);
  const { data, loading, error, reload } = useRepositoryQuery(query, [currentUserId]);
  const filtered = useMemo(
    () => (data ?? []).filter((row) => filter === "ALL" || row.state === filter),
    [data, filter],
  );

  return (
    <main className="oa-admin-page">
      <AdminPageHeader
        eyebrow="OA / ADMIN / RECORDS"
        title="RECORDS"
        description="완료 Program의 Record 작성 여부를 확인하고 기존 Archive로 이동합니다."
      />
      <div className="oa-admin-toolbar">
        <div className="oa-admin-filters" role="group" aria-label="Record status">
          {(["ALL", "REQUIRED", "RECORDED"] as const).map((value) => (
            <button
              className="oa-admin-filter"
              type="button"
              key={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      {loading ? <AdminLoading label="Record 상태를 불러오는 중입니다." /> : null}
      {error ? <AdminError message={error.message} onRetry={reload} /> : null}
      {data && filtered.length === 0 ? (
        <AdminState
          label="RECORDS"
          title="NO RECORD TASKS"
          description="선택한 상태에 해당하는 Program이 없습니다."
        />
      ) : null}
      {filtered.length > 0 ? (
        <ol className="oa-admin-worklist">
          {filtered.map(({ snapshot, record, state }) => {
            const { program } = snapshot;
            return (
              <li key={program.id}>
                <Link
                  className="oa-admin-work-row"
                  href={`/program/${program.id}?tab=${record ? "record" : "info"}`}
                >
                  <span className="oa-admin-work-main">
                    <small>{formatProgramKind(program)} · {program.code}</small>
                    <strong>{program.title}</strong>
                    <em>{record?.what ?? "RECORD NOT WRITTEN"}</em>
                  </span>
                  <span className="oa-admin-work-meta">
                    <small>PROGRAM ENDED</small>
                    <strong>{formatLongDate(program.endAt ?? program.startAt)}</strong>
                  </span>
                  <dl className="oa-admin-work-stats">
                    <div>
                      <dt>RECORD</dt>
                      <dd>{state}</dd>
                    </div>
                  </dl>
                  <span className="oa-admin-work-action">OPEN →</span>
                </Link>
              </li>
            );
          })}
        </ol>
      ) : null}
    </main>
  );
}
