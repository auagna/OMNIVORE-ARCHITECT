"use client";

import Link from "next/link";
import { useCallback } from "react";
import { useAppState, useRepositoryQuery } from "@/features/app-state/app-state-provider";
import type { OARepository } from "@/lib/repositories";
import { AdminError, AdminLoading, AdminPageHeader } from "./admin-ui";

interface OverviewData {
  approvals: number;
  pendingMembers: number;
  recordRequired: number;
}

export function AdminOverview() {
  const { currentUserId } = useAppState();
  const query = useCallback(async (repository: OARepository): Promise<OverviewData> => {
    if (!currentUserId) throw new Error("관리자 로그인이 필요합니다.");
    const now = new Date().toISOString();
    const [approvals, users, programs] = await Promise.all([
      repository.listApprovalQueue(currentUserId, ["PENDING"], now),
      repository.listUsers(currentUserId),
      repository.listPrograms(undefined, now),
    ]);
    return {
      approvals: approvals.length,
      pendingMembers: users.filter((user) => user.status === "PENDING").length,
      recordRequired: programs.filter((program) => program.displayStatus === "RECORD_REQUIRED").length,
    };
  }, [currentUserId]);
  const { data, loading, error, reload } = useRepositoryQuery(query, [currentUserId]);

  return (
    <main className="oa-admin-page">
      <AdminPageHeader
        eyebrow="OA / ADMIN / OVERVIEW"
        title="TODAY'S TASKS"
        description="운영자가 지금 판단하거나 처리해야 하는 항목만 먼저 보여줍니다."
      />
      {loading ? <AdminLoading /> : null}
      {error ? <AdminError message={error.message} onRetry={reload} /> : null}
      {data ? (
        <section className="oa-admin-task-list" aria-label="Admin tasks">
          <Link href="/admin?view=approvals">
            <span>APPROVALS</span>
            <strong>{String(data.approvals).padStart(2, "0")}</strong>
            <em>REVIEW →</em>
          </Link>
          <div>
            <span>UNANSWERED</span>
            <strong>—</strong>
            <em>PROGRAM TALK</em>
          </div>
          <Link href="/admin?view=members">
            <span>PENDING MEMBERS</span>
            <strong>{String(data.pendingMembers).padStart(2, "0")}</strong>
            <em>OPEN →</em>
          </Link>
          <Link href="/admin?view=records">
            <span>RECORD REQUIRED</span>
            <strong>{String(data.recordRequired).padStart(2, "0")}</strong>
            <em>OPEN →</em>
          </Link>
        </section>
      ) : null}
      <section className="oa-admin-note" aria-labelledby="admin-priority-note">
        <p className="oa-admin-kicker">OPERATING PRINCIPLE</p>
        <h2 id="admin-priority-note">TASK FIRST.<br />PROGRAM CENTERED.</h2>
        <p>Approval은 운영 상태와 분리되며, 승인된 Program만 OPEN으로 전환됩니다.</p>
      </section>
    </main>
  );
}
