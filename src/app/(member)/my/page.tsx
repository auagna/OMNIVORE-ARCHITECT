"use client";

import Link from "next/link";
import { useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { LockedState } from "@/components/feedback";
import { useAppState, useRepositoryQuery } from "@/features/app-state/app-state-provider";
import { getProgramCapabilities } from "@/features/programs/domain";
import { ProgramEditorialList } from "@/features/programs/views/program-editorial-link";
import { QueryEmpty, QueryError, QueryLoading } from "@/features/programs/views/query-state";
import type { OARepository } from "@/lib/repositories";

export default function MyPage() {
  const searchParams = useSearchParams();
  const { currentUserId, sessionLoading } = useAppState();
  const query = useCallback(async (repo: OARepository) => {
    if (!currentUserId) return { upcoming: [], hosting: [], proposals: [], user: null };
    const now = new Date().toISOString();
    const [upcoming, hosting, proposals, user] = await Promise.all([
      repo.listMyUpcoming(currentUserId, now),
      repo.listHostedPrograms(currentUserId, now),
      repo.listMyProposals(currentUserId, now),
      repo.getUserById(currentUserId),
    ]);
    return { upcoming, hosting, proposals, user };
  }, [currentUserId]);
  const { data, loading, error, reload } = useRepositoryQuery(query, [currentUserId]);
  const recordRequired = useMemo(
    () => data?.hosting.filter((item) => item.displayStatus === "RECORD_REQUIRED") ?? [],
    [data?.hosting],
  );
  const joined = searchParams.get("joined");
  const registered = searchParams.get("registered") === "1";
  const submittedProposal = searchParams.get("proposal");
  const placement = searchParams.get("status")?.toUpperCase();

  if (!sessionLoading && !currentUserId) {
    return (
      <main className="oa-page oa-page--narrow">
        <LockedState
          title="LOGIN REQUIRED"
          description="MY는 로그인한 Member만 확인할 수 있습니다."
          action={<Link className="oa-label" href="/login">LOGIN →</Link>}
        />
      </main>
    );
  }

  return (
    <main className="oa-page oa-page--narrow oa-page--my">
      <header className="oa-page-head">
        <p className="oa-overline">OA / MEMBER</p>
        <h1 className="oa-page-title">MY</h1>
      </header>

      {registered ? (
        <p className="oa-flash" role="status">
          가입 신청이 접수되었습니다. ADMIN 승인 후 Program에 참여할 수 있습니다.
        </p>
      ) : null}
      {joined ? (
        <p className="oa-flash" role="status">
          {placement === "WAITLIST" ? "대기 명단에 등록되었습니다." : "참여가 확정되었습니다."} Program에서 다음 일정을 확인하세요.
        </p>
      ) : null}
      {submittedProposal ? (
        <p className="oa-flash" role="status">
          제안이 운영진에게 제출되었습니다. 승인 전까지 공개 Program에는 표시되지 않습니다.
        </p>
      ) : null}
      {loading || sessionLoading ? <QueryLoading label="내 Program을 불러오는 중입니다." /> : null}
      {error ? <QueryError message={error.message} onRetry={reload} /> : null}

      {data ? (
        <>
          <section className="oa-section" aria-labelledby="my-upcoming">
            <div className="oa-section-heading"><h2 id="my-upcoming">UPCOMING</h2><span className="oa-label">{data.upcoming.length}</span></div>
            {data.upcoming.length ? <ProgramEditorialList programs={data.upcoming} headingLevel="h3" /> : <QueryEmpty title="예정된 참여가 없습니다." description="OPEN Program을 발견하고 참여해 보세요." />}
          </section>

          <section className="oa-section" aria-labelledby="my-hosting">
            <div className="oa-section-heading"><h2 id="my-hosting">HOSTING</h2><span className="oa-label">{data.hosting.length}</span></div>
            {data.hosting.length ? (
              <div className="oa-operation-list">
                {data.hosting.map(({ program, displayStatus, participantCounts }) => (
                  <Link href={`/my/hosting/${program.id}`} key={program.id}>
                    <span className="oa-operation-title">{program.title}</span>
                    <span className="oa-operation-meta">{displayStatus.replaceAll("_", " ")} · {participantCounts.confirmed}/{program.capacity ?? "—"} →</span>
                  </Link>
                ))}
              </div>
            ) : <QueryEmpty title="운영 중인 Gathering이 없습니다." description="PROPOSE에서 새 Gathering을 제안할 수 있습니다." />}
          </section>

          <section className="oa-section" aria-labelledby="my-proposals">
            <div className="oa-section-heading"><h2 id="my-proposals">PROPOSALS</h2><span className="oa-label">{data.proposals.length}</span></div>
            {data.proposals.length ? (
              <div className="oa-operation-list">
                {data.proposals.map(({ approval, snapshot }) => {
                  const canRevise = getProgramCapabilities({
                    user: data.user,
                    program: snapshot.program,
                    participation: null,
                    approval,
                    record: snapshot.record,
                    participantCounts: snapshot.participantCounts,
                  }).canSubmitForApproval;

                  return (
                    <article className="oa-proposal-row" key={approval.id}>
                      <div className="oa-row-between">
                        <div>
                          <p className="oa-overline">{approval.status === "CHANGES_REQUESTED" ? "NEEDS REVISION" : approval.status.replaceAll("_", " ")}</p>
                          <h3 className="oa-operation-title">{snapshot.program.title}</h3>
                        </div>
                        {canRevise ? (
                          <Link className="oa-label" href={`/gatherings/propose?edit=${snapshot.program.id}`}>EDIT →</Link>
                        ) : null}
                      </div>
                      {approval.reviewComment ? <p className="oa-field-help">운영진 요청: {approval.reviewComment}</p> : null}
                    </article>
                  );
                })}
              </div>
            ) : <QueryEmpty title="제출한 Proposal이 없습니다." description="Gathering을 제안하면 승인 상태가 이곳에 표시됩니다." />}
          </section>

          <section className="oa-section" aria-labelledby="my-messages">
            <div className="oa-section-heading"><h2 id="my-messages">MESSAGES</h2><span className="oa-label">PROGRAM TALK</span></div>
            <p className="oa-empty">중요 업데이트는 참여 중인 Program의 TALK에서 확인할 수 있습니다.</p>
          </section>

          <section className="oa-section" aria-labelledby="my-records">
            <div className="oa-section-heading"><h2 id="my-records">RECORD REQUIRED</h2><span className="oa-label">{recordRequired.length}</span></div>
            {recordRequired.length ? <ProgramEditorialList programs={recordRequired} headingLevel="h3" /> : <p className="oa-empty">작성할 짧은 Record가 없습니다.</p>}
          </section>

          <section className="oa-section" aria-labelledby="my-past">
            <div className="oa-section-heading"><h2 id="my-past">PAST</h2></div>
            <p className="oa-empty">지난 참여 Program이 없습니다.</p>
          </section>

          <section className="oa-section" aria-labelledby="my-profile">
            <div className="oa-section-heading"><h2 id="my-profile">PROFILE</h2></div>
            <dl className="oa-info-grid">
              <div className="oa-info-row"><dt>NAME</dt><dd>{data.user?.name ?? "MEMBER"}</dd></div>
              <div className="oa-info-row"><dt>EMAIL</dt><dd>{data.user?.email ?? "—"}</dd></div>
              <div className="oa-info-row"><dt>STATUS</dt><dd>{data.user?.status ?? "—"}</dd></div>
            </dl>
          </section>
        </>
      ) : null}
    </main>
  );
}
