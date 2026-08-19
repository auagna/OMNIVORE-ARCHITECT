"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { ConfirmationDialog } from "@/components/feedback";
import { useAppState, useRepositoryQuery } from "@/features/app-state/app-state-provider";
import { getProgramCapabilities } from "@/features/programs/domain";
import { formatCost, formatLongDate, formatProgramKind, formatTimeRange } from "@/lib/format";
import type { OARepository } from "@/lib/repositories";
import type { GatheringProgram, ProgramApprovalSnapshot, User } from "@/types";
import { AdminError, AdminLoading, AdminPageHeader, AdminState } from "./admin-ui";

interface QueueItem {
  proposal: ProgramApprovalSnapshot;
  requester: User | null;
}

function paymentInformation(program: GatheringProgram): string {
  if (program.detail.cost.type === "FREE") return "NOT REQUIRED";
  if (program.detail.cost.type === "INDIVIDUAL_PURCHASE") {
    return program.detail.cost.purchaseNote || "INDIVIDUAL PURCHASE";
  }
  return program.detail.cost.paymentInfo ?? "RESTRICTED UNTIL AUTHORIZED";
}

function refundInformation(program: GatheringProgram): string {
  if (program.detail.cost.type === "FREE") return "NOT APPLICABLE";
  if (program.detail.cost.type === "INDIVIDUAL_PURCHASE") return "구매처의 취소·환불 정책을 따릅니다.";
  return program.detail.cost.cancellationPolicy || "NOT PROVIDED";
}

export function AdminApprovalQueue() {
  const { currentUserId } = useAppState();
  const searchParams = useSearchParams();
  const query = useCallback(async (repository: OARepository): Promise<QueueItem[]> => {
    if (!currentUserId) throw new Error("관리자 로그인이 필요합니다.");
    const proposals = await repository.listApprovalQueue(
      currentUserId,
      ["PENDING"],
      new Date().toISOString(),
    );
    return Promise.all(
      proposals.map(async (proposal) => ({
        proposal,
        requester: await repository.getUserById(proposal.approval.requesterId),
      })),
    );
  }, [currentUserId]);
  const { data, loading, error, reload } = useRepositoryQuery(query, [currentUserId]);

  return (
    <main className="oa-admin-page">
      <AdminPageHeader
        eyebrow="OA / ADMIN / APPROVALS"
        title="APPROVALS"
        description="멤버가 제안한 Gathering의 운영 핵심 정보를 검토합니다."
      />
      {searchParams.get("reviewed") ? (
        <p className="oa-admin-flash" role="status">REVIEW COMPLETED / {searchParams.get("reviewed")?.replaceAll("_", " ").toUpperCase()}</p>
      ) : null}
      {loading ? <AdminLoading label="승인 요청을 불러오는 중입니다." /> : null}
      {error ? <AdminError message={error.message} onRetry={reload} /> : null}
      {data?.length ? (
        <section className="oa-admin-queue" aria-label="Pending approval queue">
          <div className="oa-admin-table-head" aria-hidden="true">
            <span>PROGRAM</span><span>HOST</span><span>WHEN</span><span>PEOPLE / COST</span><span>ACTION</span>
          </div>
          {data.map(({ proposal, requester }) => {
            const { program } = proposal.snapshot;
            return (
              <Link href={`/admin?view=approvals&program=${program.id}`} key={proposal.approval.id}>
                <span className="oa-admin-queue-title">
                  <small>{formatProgramKind(program)}</small>
                  <strong>{program.title}</strong>
                </span>
                <span>{requester?.name ?? proposal.snapshot.host?.name ?? "—"}</span>
                <span>{formatLongDate(program.startAt)}<small>{formatTimeRange(program.startAt, program.endAt)}</small></span>
                <span>{program.capacity ?? "—"} PEOPLE<small>{formatCost(program)}</small></span>
                <span className="oa-admin-row-action">REVIEW →</span>
              </Link>
            );
          })}
        </section>
      ) : null}
      {data && data.length === 0 ? (
        <AdminState label="QUEUE / 00" title="NO PENDING APPROVALS" description="현재 검토를 기다리는 Gathering 제안이 없습니다." />
      ) : null}
    </main>
  );
}

interface ReviewData {
  proposal: ProgramApprovalSnapshot;
  requester: User | null;
  reviewer: User;
}

export function AdminApprovalReview({ programId }: { programId: string }) {
  const router = useRouter();
  const { repository, currentUserId } = useAppState();
  const [comment, setComment] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const query = useCallback(async (repo: OARepository): Promise<ReviewData | null> => {
    if (!currentUserId) throw new Error("관리자 로그인이 필요합니다.");
    const now = new Date().toISOString();
    const [approval, publicSnapshot, revision, reviewer] = await Promise.all([
      repo.getProgramApproval(programId, currentUserId),
      repo.getProgramSnapshotById(programId, now, currentUserId),
      repo.getGatheringRevision(programId, currentUserId),
      repo.getUserById(currentUserId),
    ]);
    const snapshot = publicSnapshot && revision
      ? { ...publicSnapshot, program: revision.proposedProgram }
      : publicSnapshot;
    if (!approval || !snapshot || !reviewer) return null;
    return {
      proposal: { approval, snapshot },
      requester: await repo.getUserById(approval.requesterId),
      reviewer,
    };
  }, [currentUserId, programId]);
  const { data, loading, error, reload } = useRepositoryQuery(query, [currentUserId, programId]);

  async function review(status: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED") {
    if (pending || !currentUserId) return;
    const cleanComment = comment.trim();
    if (status === "CHANGES_REQUESTED" && !cleanComment) {
      setCommentError("수정 요청 사유를 입력해 주세요.");
      return;
    }
    setPending(true);
    setCommentError(null);
    setMutationError(null);
    try {
      const decision = status === "CHANGES_REQUESTED"
        ? { status, comment: cleanComment } as const
        : status === "REJECTED"
          ? { status, comment: cleanComment || null } as const
          : { status } as const;
      await repository.reviewProgramApproval(
        programId,
        decision,
        currentUserId,
        new Date().toISOString(),
      );
      router.replace(`/admin?view=approvals&reviewed=${status.toLowerCase()}`);
    } catch (reason) {
      setMutationError(reason instanceof Error ? reason.message : "승인 결정을 저장하지 못했습니다.");
      setRejectOpen(false);
    } finally {
      setPending(false);
    }
  }

  if (loading) return <main className="oa-admin-page"><AdminLoading label="제안 정보를 불러오는 중입니다." /></main>;
  if (error) return <main className="oa-admin-page"><AdminError message={error.message} onRetry={reload} /></main>;
  if (!data) {
    return <main className="oa-admin-page"><AdminState label="APPROVAL" title="PROPOSAL NOT FOUND" description="요청한 승인 건을 찾을 수 없거나 접근 권한이 없습니다." action={<Link className="oa-admin-text-action" href="/admin?view=approvals">BACK TO APPROVALS →</Link>} /></main>;
  }

  const { approval, snapshot } = data.proposal;
  const { program } = snapshot;
  if (program.type !== "GATHERING") {
    return <main className="oa-admin-page"><AdminError message="Gathering 제안만 이 화면에서 검토할 수 있습니다." retry={false} /></main>;
  }
  const reviewable = getProgramCapabilities({
    user: data.reviewer,
    program,
    participation: null,
    approval,
    record: snapshot.record,
    participantCounts: snapshot.participantCounts,
  }).canReviewApproval;

  return (
    <main className="oa-admin-page">
      <AdminPageHeader
        eyebrow="OA / ADMIN / APPROVAL REVIEW"
        title={program.title}
        description={`${formatProgramKind(program)} · ${approval.status.replaceAll("_", " ")}`}
        action={<Link className="oa-admin-text-action" href="/admin?view=approvals">QUEUE →</Link>}
      />

      <section className="oa-admin-review" aria-label="Gathering proposal details">
        <dl>
          <div><dt>HOST</dt><dd>{data.requester?.name ?? snapshot.host?.name ?? "—"}</dd></div>
          <div><dt>DATE</dt><dd>{formatLongDate(program.startAt)}</dd></div>
          <div><dt>TIME</dt><dd>{formatTimeRange(program.startAt, program.endAt)}</dd></div>
          <div><dt>PLACE</dt><dd>{program.location}{program.detail.meetingPoint ? <small>MEET / {program.detail.meetingPoint}</small> : null}</dd></div>
          <div><dt>CAPACITY</dt><dd>{program.capacity ?? "—"} PEOPLE</dd></div>
          <div><dt>COST</dt><dd>{formatCost(program)}</dd></div>
          <div><dt>PAYMENT</dt><dd>{paymentInformation(program)}</dd></div>
          <div><dt>REFUND</dt><dd>{refundInformation(program)}</dd></div>
          <div className="oa-admin-review-wide"><dt>DESCRIPTION</dt><dd>{program.description}</dd></div>
        </dl>
      </section>

      <section className="oa-admin-review-actions" aria-labelledby="review-decision-heading">
        <div>
          <p className="oa-admin-kicker">DECISION</p>
          <h2 id="review-decision-heading">REVIEW ACTION</h2>
        </div>
        {approval.reviewComment ? <p className="oa-admin-review-history">LAST COMMENT / {approval.reviewComment}</p> : null}
        <label htmlFor="review-comment">REVIEW COMMENT <span>{reviewable ? "REQUIRED FOR CHANGES" : "READ ONLY"}</span></label>
        <textarea
          id="review-comment"
          rows={5}
          value={comment}
          onChange={(event) => {
            setComment(event.target.value);
            setCommentError(null);
          }}
          aria-invalid={Boolean(commentError)}
          aria-describedby={commentError ? "review-comment-error" : undefined}
          disabled={!reviewable || pending}
          placeholder="수정 요청 또는 거절 사유를 구체적으로 남겨주세요."
        />
        {commentError ? <p className="oa-admin-field-error" id="review-comment-error" role="alert">{commentError}</p> : null}
        {mutationError ? <p className="oa-admin-field-error" role="alert">{mutationError}</p> : null}
        {reviewable ? (
          <div className="oa-admin-decision-bar">
            <button className="oa-admin-secondary-button" type="button" disabled={pending} onClick={() => void review("CHANGES_REQUESTED")}>REQUEST CHANGES</button>
            <button className="oa-admin-tertiary-button" type="button" disabled={pending} onClick={() => setRejectOpen(true)}>REJECT</button>
            <button className="oa-admin-primary-button" type="button" disabled={pending} onClick={() => void review("APPROVED")}>{pending ? "SAVING…" : "APPROVE →"}</button>
          </div>
        ) : (
          <p className="oa-admin-flash" role="status">REVIEW COMPLETE / {approval.status.replaceAll("_", " ")}</p>
        )}
      </section>

      <ConfirmationDialog
        open={rejectOpen}
        eyebrow="REJECT PROPOSAL"
        title="이 제안을 거절할까요?"
        description="거절 후에는 이 승인 요청을 다시 검토할 수 없습니다. 필요한 경우 먼저 수정 요청을 사용하세요."
        confirmLabel="REJECT"
        danger
        pending={pending}
        onCancel={() => setRejectOpen(false)}
        onConfirm={() => void review("REJECTED")}
      />
    </main>
  );
}
