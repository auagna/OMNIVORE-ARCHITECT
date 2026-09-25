"use client";

import Link from "next/link";
import { useCallback } from "react";
import { OAParticleWordmark } from "@/components/ui";
import { useAppState, useRepositoryQuery } from "@/features/app-state/app-state-provider";
import { ProgramEditorialLink } from "@/features/programs/views/program-editorial-link";
import { QueryEmpty, QueryError, QueryLoading } from "@/features/programs/views/query-state";
import { currentDate, currentTimestamp } from "@/lib/current-time";
import { formatShortDate } from "@/lib/format";
import type { OARepository } from "@/lib/repositories";
import type { HomeAction } from "@/types";

function homeActionPresentation(action: HomeAction) {
  switch (action.type) {
    case "CHANGES_REQUESTED":
      return {
        label: "CHANGES REQUESTED",
        actionLabel: "REVIEW →",
        href: `/gatherings/propose?edit=${action.programId}`,
      } as const;
    case "RECORD_REQUIRED":
      return {
        label: "RECORD REQUIRED",
        actionLabel: "WRITE →",
        href: `/program/${action.programId}?tab=record`,
      } as const;
    case "PAYMENT_REQUIRED":
      return {
        label: "PAYMENT REQUIRED",
        actionLabel: "REVIEW →",
        href: `/program/${action.programId}`,
      } as const;
  }
}

export default function HomePage() {
  const { currentUserId } = useAppState();
  const query = useCallback(async (repository: OARepository) => {
    const [home, content, actions] = await Promise.all([
      repository.getHomeData(currentTimestamp()),
      repository.getPageContent("home"),
      currentUserId
        ? repository.listMyActions(currentUserId, currentTimestamp())
        : Promise.resolve([]),
    ]);
    return { home, content, actions };
  }, [currentUserId]);
  const { data, loading, error, reload } = useRepositoryQuery(query, [currentUserId]);
  const date = currentDate();
  const day = new Intl.DateTimeFormat("en-GB", { day: "2-digit", timeZone: "Asia/Seoul" }).format(date);
  const month = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "Asia/Seoul" }).format(date).toUpperCase();
  const year = new Intl.DateTimeFormat("en-GB", { year: "numeric", timeZone: "Asia/Seoul" }).format(date);
  const dateTime = `${year}-${String(date.getMonth() + 1).padStart(2, "0")}-${day}`;

  return (
    <main className="oa-page oa-page--wide">
      <header className="oa-home-masthead">
        <div className="oa-home-context">
          <p>OA / TODAY</p>
          <time dateTime={dateTime}>{day} {month} {year}</time>
          <span>SEOUL</span>
        </div>
        <OAParticleWordmark />
        {data?.content?.headline ? <p className="oa-home-headline">{data.content.headline}</p> : null}
        {data?.content?.description ? <p className="oa-home-intro">{data.content.description}</p> : null}
      </header>

      {loading ? <QueryLoading /> : null}
      {error ? <QueryError message={error.message} onRetry={reload} /> : null}

      {data ? (
        <>
          <section className="oa-section oa-home-next oa-reveal" aria-labelledby="next-heading">
            <div className="oa-section-heading">
              <h2 id="next-heading">NEXT</h2>
              <Link className="oa-label" href="/calendar">CALENDAR →</Link>
            </div>
            {data.home.next ? (
              <ProgramEditorialLink snapshot={data.home.next} action="DETAIL →" headingLevel="h3" />
            ) : (
              <p className="oa-empty">예정된 프로그램이 없습니다.</p>
            )}
          </section>

          {data.actions.length > 0 ? (
            <section className="oa-section oa-home-actions" aria-labelledby="my-action-heading">
              <div className="oa-section-heading">
                <h2 id="my-action-heading">MY ACTION</h2>
                <Link className="oa-label" href="/my">MY →</Link>
              </div>
              <div className="oa-home-action-list">
                {data.actions.map((action) => {
                  const presentation = homeActionPresentation(action);
                  return (
                    <Link
                      className="oa-home-action"
                      href={presentation.href}
                      key={`${action.type}-${action.programId}`}
                    >
                      <div className="oa-home-action__content">
                        <p className="oa-overline">{presentation.label}</p>
                        <h3 className="oa-home-action__title">{action.programTitle}</h3>
                        <p className="oa-home-action__description">{action.description}</p>
                      </div>
                      <span className="oa-home-action__link">{presentation.actionLabel}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ) : null}

          <div className="oa-home-secondary-grid">
            <section className="oa-section oa-home-open" aria-labelledby="open-heading">
              <div className="oa-section-heading">
                <h2 id="open-heading">OPEN</h2>
                <Link className="oa-label" href="/programs">ALL PROGRAMS →</Link>
              </div>
              <div className="oa-editorial-list">
                {data.home.open.map((program) => (
                  <ProgramEditorialLink key={program.program.id} snapshot={program} headingLevel="h3" />
                ))}
                {data.home.open.length === 0 ? <QueryEmpty title="모집 중인 Program이 없습니다." description="다음 Program이 열리면 이곳에서 바로 확인할 수 있습니다." /> : null}
              </div>
            </section>

            <section className="oa-section" aria-labelledby="record-heading">
              <div className="oa-section-heading">
                <h2 id="record-heading">FROM OMNIVORE</h2>
              </div>
              {data.home.recentRecords.map(({ record, program }, index) => (
                <article className="oa-record-teaser" key={record.id}>
                  <p className="oa-overline">RECORD / {String(index + 27).padStart(3, "0")}</p>
                  <h3>{record.what}</h3>
                  <div className="oa-row-between">
                    <p className="oa-meta oa-muted">{formatShortDate(record.createdAt)}</p>
                    <Link className="oa-label" href={`/program/${program.id}`}>READ →</Link>
                  </div>
                </article>
              ))}
              {data.home.recentRecords.length === 0 ? <QueryEmpty title="아직 Record가 없습니다." description="완료된 Program의 짧은 기록이 이곳에 남습니다." /> : null}
            </section>
          </div>
        </>
      ) : null}
    </main>
  );
}
