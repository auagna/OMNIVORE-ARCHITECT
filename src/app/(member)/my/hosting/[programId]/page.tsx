"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { ConfirmationDialog, LockedState } from "@/components/feedback";
import { useAppState, useRepositoryQuery } from "@/features/app-state/app-state-provider";
import { getProgramCapabilities } from "@/features/programs/domain";
import { QueryError, QueryLoading } from "@/features/programs/views/query-state";
import type { OARepository } from "@/lib/repositories";
import type { ProgramStatus } from "@/types";

type Operation = "CLOSED" | "CANCELLED" | null;

export default function HostManagementPage() {
  const params = useParams<{ programId: string }>();
  const searchParams = useSearchParams();
  const { repository, currentUserId, sessionLoading } = useAppState();
  const [operation, setOperation] = useState<Operation>(null);
  const [pending, setPending] = useState(false);
  const [pendingPaymentId, setPendingPaymentId] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const query = useCallback(
    (repo: OARepository) => {
      if (!currentUserId) return Promise.reject(new Error("로그인이 필요합니다."));
      return Promise.all([
        repo.getHostDashboard(params.programId, currentUserId, new Date().toISOString()),
        repo.getUserById(currentUserId),
        repo.getProgramApproval(params.programId, currentUserId),
      ]).then(([dashboard, user, approval]) => ({ dashboard, user, approval }));
    },
    [currentUserId, params.programId],
  );
  const { data, loading, error, reload } = useRepositoryQuery(query, [currentUserId, params.programId]);

  async function updateStatus(status: ProgramStatus) {
    if (pending) return;
    setPending(true);
    setOperationError(null);
    try {
      if (!currentUserId) throw new Error("로그인이 필요합니다.");
      await repository.setProgramStatus(params.programId, status, currentUserId, new Date().toISOString());
      setOperation(null);
    } catch (reason) {
      setOperationError(reason instanceof Error ? reason.message : "운영 상태를 변경하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  async function confirmPayment(participationId: string) {
    if (pendingPaymentId || !currentUserId) return;
    setPendingPaymentId(participationId);
    setOperationError(null);
    try {
      await repository.confirmParticipationPayment(
        participationId,
        currentUserId,
        new Date().toISOString(),
      );
    } catch (reason) {
      setOperationError(reason instanceof Error ? reason.message : "입금 상태를 변경하지 못했습니다.");
    } finally {
      setPendingPaymentId(null);
    }
  }

  if (loading || sessionLoading) return <main className="oa-page oa-page--narrow"><QueryLoading label="운영 정보를 불러오는 중입니다." /></main>;
  if (!currentUserId) return <main className="oa-page oa-page--narrow"><LockedState title="LOGIN REQUIRED" description="Hosting은 로그인한 Host만 확인할 수 있습니다." action={<Link className="oa-label" href="/login">LOGIN →</Link>} /></main>;
  if (error) return <main className="oa-page oa-page--narrow"><QueryError message={error.message} onRetry={reload} /></main>;
  if (!data) return null;

  const { dashboard, user, approval } = data;
  const { snapshot, participants, payment } = dashboard;
  const { program, participantCounts } = snapshot;
  const capabilities = getProgramCapabilities({
    user,
    program,
    participation: null,
    approval,
    record: snapshot.record,
    participantCounts,
  });
  const shortCode = program.code.replace(/^OA\s*\/\s*/, "");

  return (
    <main className="oa-page oa-page--narrow oa-page--operations">
      {searchParams.get("published") ? <p className="oa-flash" role="status">Gathering이 게시되었습니다.</p> : null}
      {searchParams.get("updated") ? <p className="oa-flash" role="status">운영 정보가 반영되었습니다.</p> : null}
      <header className="oa-page-head oa-page-head--compact">
        <p className="oa-overline">HOSTING / {shortCode}</p>
        <h1 className="oa-page-title oa-page-title--detail">{program.title}</h1>
        <div className="oa-row-between">
          <span className="oa-status">{snapshot.displayStatus.replaceAll("_", " ")}</span>
          <span className="oa-label">{participantCounts.confirmed} / {program.capacity ?? "—"}</span>
        </div>
      </header>

      {operationError ? <p className="oa-flash" role="alert">{operationError}</p> : null}

      <section className="oa-section" aria-labelledby="hosting-people">
        <div className="oa-section-heading"><h2 id="hosting-people">PEOPLE</h2></div>
        <div className="oa-metric-grid">
          <div className="oa-metric"><span>CONFIRMED</span><strong>{participantCounts.confirmed}</strong></div>
          <div className="oa-metric"><span>WAITLIST</span><strong>{participantCounts.waitlist}</strong></div>
        </div>
      </section>

      <section className="oa-section" aria-labelledby="hosting-payment">
        <div className="oa-section-heading"><h2 id="hosting-payment">PAYMENT</h2><span className="oa-label">HOST ONLY</span></div>
        <div className="oa-metric-grid">
          <div className="oa-metric"><span>PAID</span><strong>{payment.paid}</strong></div>
          <div className="oa-metric"><span>PENDING</span><strong>{payment.pending}</strong></div>
        </div>
      </section>

      <section className="oa-section" aria-labelledby="hosting-talk">
        <div className="oa-section-heading"><h2 id="hosting-talk">TALK</h2></div>
        <div className="oa-operation-list">
          <Link href={`/program/${program.id}?tab=talk`}>OPEN TALK <span>→</span></Link>
        </div>
      </section>

      <section className="oa-section" aria-labelledby="hosting-participants">
        <div className="oa-section-heading"><h2 id="hosting-participants">PARTICIPANTS</h2></div>
        {participants.length ? (
          <div className="oa-editorial-list">
            {participants.map(({ participation, user }) => (
              <div className="oa-host-participant" key={participation.id}>
                <div><strong>{user.name}</strong><span>{participation.status}</span></div>
                <div>
                  <span>PAYMENT</span>
                  <strong>{participation.paymentStatus.replaceAll("_", " ")}</strong>
                  {capabilities.canManagePayments && participation.paymentStatus === "PENDING" ? (
                    <button
                      className="oa-inline-action"
                      type="button"
                      onClick={() => void confirmPayment(participation.id)}
                      disabled={pendingPaymentId !== null}
                    >
                      {pendingPaymentId === participation.id ? "SAVING…" : "MARK PAID"}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="oa-empty">아직 참가자나 대기자가 없습니다.</p>
        )}
      </section>

      <section className="oa-section" aria-labelledby="hosting-operations">
        <div className="oa-section-heading"><h2 id="hosting-operations">OPERATIONS</h2></div>
        <div className="oa-operation-list">
          {capabilities.canEditProgram ? (
            <Link href={`/gatherings/propose?edit=${program.id}&mode=manage`}>EDIT INFORMATION <span>→</span></Link>
          ) : (
            <button type="button" disabled>EDIT INFORMATION <span>LOCKED</span></button>
          )}
          <Link href={`/program/${program.id}`}>VIEW PROGRAM <span>→</span></Link>
          <button type="button" onClick={() => setOperation("CLOSED")} disabled={!capabilities.canCloseRecruitment}>CLOSE RECRUITMENT <span>→</span></button>
          <button type="button" onClick={() => setOperation("CANCELLED")} disabled={!capabilities.canCancelProgram}>CANCEL GATHERING <span>→</span></button>
        </div>
      </section>

      <ConfirmationDialog
        open={operation === "CLOSED"}
        eyebrow="CLOSE RECRUITMENT"
        title="모집을 마감할까요?"
        description="Program 정보는 유지되지만 더 이상 새 참여 신청을 받지 않습니다."
        confirmLabel="CLOSE"
        cancelLabel="KEEP RECRUITMENT OPEN"
        pending={pending}
        onCancel={() => setOperation(null)}
        onConfirm={() => void updateStatus("CLOSED")}
      />
      <ConfirmationDialog
        open={operation === "CANCELLED"}
        eyebrow="CANCEL GATHERING"
        title="Gathering을 취소할까요?"
        description="참가자에게 취소 사실을 별도로 안내해야 합니다. 이 작업은 운영 상태를 CANCELLED로 변경합니다."
        confirmLabel="CANCEL GATHERING"
        cancelLabel="KEEP GATHERING"
        danger
        pending={pending}
        onCancel={() => setOperation(null)}
        onConfirm={() => void updateStatus("CANCELLED")}
      />
    </main>
  );
}
