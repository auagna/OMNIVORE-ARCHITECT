"use client";

import { useCallback } from "react";
import { useRepositoryQuery } from "@/features/app-state/app-state-provider";
import { QueryError, QueryLoading } from "@/features/programs/views/query-state";
import type { OARepository } from "@/lib/repositories";

export default function AboutPage() {
  const query = useCallback((repository: OARepository) => repository.getPageContent("about"), []);
  const { data: content, loading, error, reload } = useRepositoryQuery(query);

  return (
    <main className="oa-page oa-page--narrow">
      <header className="oa-page-head"><p className="oa-overline">OA / ABOUT</p><h1 className="oa-page-title">{content?.title ?? "ABOUT"}</h1></header>
      {loading ? <QueryLoading /> : null}
      {error ? <QueryError message={error.message} onRetry={reload} /> : null}
      <section className="oa-description">
        <p className="oa-overline">OMNIVORE ARCHITECT</p>
        <p>{content?.headline || content?.description || "활동을 만들고, 사람이 모이고, 대화하고, 기록이 남는 건축·디자인 커뮤니티의 도구입니다."}</p>
      </section>
      <section className="oa-description">
        <p className="oa-overline">CORE LOOP</p>
        <p>DISCOVER → JOIN → TALK → ATTEND → RECORD</p>
      </section>
    </main>
  );
}
