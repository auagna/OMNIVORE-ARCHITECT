"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { PROGRAM_STATUSES, PROGRAM_TYPES } from "@/constants";
import { useAppState, useRepositoryQuery } from "@/features/app-state/app-state-provider";
import { formatLongDate, formatProgramKind } from "@/lib/format";
import type { OARepository } from "@/lib/repositories";
import type { ProgramDisplayStatus, ProgramStatus, ProgramType } from "@/types";
import { AdminError, AdminLoading, AdminPageHeader, AdminState } from "./admin-ui";

type TypeFilter = "ALL" | ProgramType;
type StatusFilter = "ALL" | ProgramStatus | ProgramDisplayStatus;

export function AdminPrograms() {
  const { currentUserId } = useAppState();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const query = useCallback(
    (repository: OARepository) => {
      if (!currentUserId) throw new Error("관리자 로그인이 필요합니다.");
      return repository.listAdminPrograms(currentUserId, new Date().toISOString());
    },
    [currentUserId],
  );
  const { data, loading, error, reload } = useRepositoryQuery(query, [currentUserId]);
  const statusOptions = useMemo<StatusFilter[]>(
    () => [
      "ALL",
      ...new Set<StatusFilter>([
        ...PROGRAM_STATUSES,
        ...(data?.map((item) => item.displayStatus) ?? []),
      ]),
    ],
    [data],
  );
  const filtered = useMemo(
    () =>
      (data ?? []).filter(
        ({ program, displayStatus }) =>
          (typeFilter === "ALL" || program.type === typeFilter) &&
          (statusFilter === "ALL" ||
            program.status === statusFilter ||
            displayStatus === statusFilter),
      ),
    [data, statusFilter, typeFilter],
  );

  return (
    <main className="oa-admin-page">
      <AdminPageHeader
        eyebrow="OA / ADMIN / PROGRAMS"
        title="PROGRAMS"
        description="공개 상태와 승인 전 Draft를 함께 확인하고, 원래 Program 맥락으로 이동합니다."
      />
      <div className="oa-admin-toolbar">
        <div className="oa-admin-filters" role="group" aria-label="Program type">
          {(["ALL", ...PROGRAM_TYPES] as const).map((value) => (
            <button
              className="oa-admin-filter"
              type="button"
              key={value}
              aria-pressed={typeFilter === value}
              onClick={() => setTypeFilter(value)}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="oa-admin-filters" role="group" aria-label="Program status">
          {statusOptions.map((value) => (
            <button
              className="oa-admin-filter"
              type="button"
              key={value}
              aria-pressed={statusFilter === value}
              onClick={() => setStatusFilter(value)}
            >
              {value.replaceAll("_", " ")}
            </button>
          ))}
        </div>
      </div>
      {loading ? <AdminLoading label="Program 운영 데이터를 불러오는 중입니다." /> : null}
      {error ? <AdminError message={error.message} onRetry={reload} /> : null}
      {data && filtered.length === 0 ? (
        <AdminState
          label="PROGRAMS"
          title="NO PROGRAMS"
          description="선택한 분류와 상태에 해당하는 Program이 없습니다."
        />
      ) : null}
      {filtered.length > 0 ? (
        <ol className="oa-admin-worklist">
          {filtered.map(({ program, participantCounts, displayStatus }) => (
            <li key={program.id}>
              <Link className="oa-admin-work-row" href={`/program/${program.id}`}>
                <span className="oa-admin-work-main">
                  <small>{formatProgramKind(program)} · {program.code}</small>
                  <strong>{program.title}</strong>
                </span>
                <span className="oa-admin-work-meta">
                  <small>WHEN / WHERE</small>
                  <strong>{formatLongDate(program.startAt)}</strong>
                  <span>{program.location}</span>
                  {program.capacity !== null ? (
                    <span>{participantCounts.confirmed} / {program.capacity} PEOPLE</span>
                  ) : null}
                </span>
                <dl className="oa-admin-work-stats">
                  <div>
                    <dt>STATUS</dt>
                    <dd>{displayStatus.replaceAll("_", " ")}</dd>
                  </div>
                </dl>
                <span className="oa-admin-work-action">OPEN →</span>
              </Link>
            </li>
          ))}
        </ol>
      ) : null}
    </main>
  );
}
