"use client";

import { useCallback, useMemo, useState } from "react";
import { USER_STATUSES } from "@/constants";
import { useAppState, useRepositoryQuery } from "@/features/app-state/app-state-provider";
import type { OARepository } from "@/lib/repositories";
import type { UserStatus } from "@/types";
import { AdminError, AdminLoading, AdminPageHeader, AdminState } from "./admin-ui";

type MemberFilter = "ALL" | UserStatus;

export function AdminMembers() {
  const { repository, currentUserId } = useAppState();
  const [filter, setFilter] = useState<MemberFilter>("PENDING");
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const query = useCallback(
    (currentRepository: OARepository) => {
      if (!currentUserId) throw new Error("관리자 로그인이 필요합니다.");
      return currentRepository.listAdminMemberRegistrations(currentUserId);
    },
    [currentUserId],
  );
  const { data, loading, error, reload } = useRepositoryQuery(query, [currentUserId]);
  const filtered = useMemo(
    () =>
      (data ?? []).filter(({ user }) => filter === "ALL" || user.status === filter),
    [data, filter],
  );

  async function approve(userId: string, name: string) {
    if (!currentUserId || pendingUserId) return;
    setPendingUserId(userId);
    setActionError(null);
    setActionStatus(null);
    try {
      await repository.approvePendingMember(
        userId,
        currentUserId,
        new Date().toISOString(),
      );
      setActionStatus(`${name} 님을 MEMBER로 승인했습니다.`);
    } catch (reason) {
      setActionError(
        reason instanceof Error ? reason.message : "Member 승인을 완료하지 못했습니다.",
      );
    } finally {
      setPendingUserId(null);
    }
  }

  return (
    <main className="oa-admin-page">
      <AdminPageHeader
        eyebrow="OA / ADMIN / MEMBERS"
        title="MEMBERS"
        description="가입 시 선택한 기수를 확인하고 PENDING 계정만 MEMBER로 승인합니다."
      />
      <div className="oa-admin-toolbar">
        <div className="oa-admin-filters" role="group" aria-label="Member status">
          {(["ALL", ...USER_STATUSES] as const).map((value) => (
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
      <div className="oa-admin-action-feedback" aria-live="polite">
        {actionError ? <p role="alert">ERROR · {actionError}</p> : null}
        {actionStatus ? <p>{actionStatus}</p> : null}
      </div>
      {loading ? <AdminLoading label="Member 승인 데이터를 불러오는 중입니다." /> : null}
      {error ? <AdminError message={error.message} onRetry={reload} /> : null}
      {data && filtered.length === 0 ? (
        <AdminState
          label="MEMBERS"
          title={filter === "PENDING" ? "NO PENDING MEMBERS" : "NO MEMBERS"}
          description={
            filter === "PENDING"
              ? "승인을 기다리는 가입자가 없습니다."
              : "선택한 상태의 Member가 없습니다."
          }
        />
      ) : null}
      {filtered.length > 0 ? (
        <ol className="oa-admin-worklist">
          {filtered.map(({ user, participatingSeasons }) => (
            <li className="oa-admin-work-row" key={user.id}>
              <span className="oa-admin-work-main">
                <small>MEMBER / {user.status}</small>
                <strong>{user.name}</strong>
                <em>{user.occupation ?? "OCCUPATION NOT SET"}</em>
              </span>
              <span className="oa-admin-work-meta">
                <small>ACCOUNT / SEASON</small>
                <strong>{user.email}</strong>
                <span>{participatingSeasons.join(" · ") || "SEASON NOT SET"}</span>
              </span>
              <dl className="oa-admin-work-stats">
                <div>
                  <dt>JOINED</dt>
                  <dd>{new Intl.DateTimeFormat("en-CA").format(new Date(user.createdAt))}</dd>
                </div>
              </dl>
              {user.status === "PENDING" ? (
                <button
                  className="oa-admin-work-action"
                  type="button"
                  aria-label={
                    pendingUserId === user.id
                      ? `${user.name} APPROVING…`
                      : `${user.name} APPROVE →`
                  }
                  disabled={pendingUserId !== null}
                  onClick={() => void approve(user.id, user.name)}
                >
                  {pendingUserId === user.id ? "APPROVING…" : "APPROVE →"}
                </button>
              ) : (
                <span className="oa-admin-work-action" aria-label={`${user.status} account`}>
                  {user.status}
                </span>
              )}
            </li>
          ))}
        </ol>
      ) : null}
    </main>
  );
}
