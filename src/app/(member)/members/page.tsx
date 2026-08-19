"use client";

import { useCallback } from "react";
import { useRepositoryQuery } from "@/features/app-state/app-state-provider";
import { QueryEmpty, QueryError, QueryLoading } from "@/features/programs/views/query-state";
import type { OARepository } from "@/lib/repositories";

export default function MembersPage() {
  const query = useCallback(async (repository: OARepository) => {
    const [content, users] = await Promise.all([
      repository.getPageContent("members"),
      repository.listMemberDirectory(),
    ]);
    return {
      content,
      members: users,
    };
  }, []);
  const { data, loading, error, reload } = useRepositoryQuery(query);
  const content = data?.content;

  return (
    <main className="oa-page oa-page--narrow">
      <header className="oa-page-head"><p className="oa-overline">OA / MEMBERS</p><h1 className="oa-page-title">{content?.title ?? "MEMBERS"}</h1></header>
      {loading ? <QueryLoading /> : null}
      {error ? <QueryError message={error.message} onRetry={reload} /> : null}
      {content?.headline ? <p className="oa-content-headline">{content.headline}</p> : null}
      {content?.description ? <p className="oa-content-description">{content.description}</p> : null}
      {data?.members.length ? (
        <section className="oa-section" aria-label="OMNIVORE ARCHITECT members">
          {data.members.map((member) => (
            <article className="oa-host-participant" key={member.id}>
              <div>
                <strong>{member.name}</strong>
                <span>{member.occupation ?? "OMNIVORE MEMBER"}</span>
              </div>
              <div>
                <span>{member.interests.length ? member.interests.join(" / ") : "OA"}</span>
              </div>
            </article>
          ))}
        </section>
      ) : null}
      {data && data.members.length === 0 ? (
        <QueryEmpty
          title={content?.emptyState ?? "NO MEMBERS"}
          description="현재 공개할 수 있는 Member가 없습니다."
        />
      ) : null}
    </main>
  );
}
