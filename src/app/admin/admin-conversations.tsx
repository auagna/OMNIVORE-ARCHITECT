"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import {
  GATHERING_CATEGORY_LABELS,
} from "@/constants";
import { useAppState, useRepositoryQuery } from "@/features/app-state/app-state-provider";
import { formatLongDate, formatProgramKind, formatTime } from "@/lib/format";
import type { OARepository } from "@/lib/repositories";
import type { GatheringCategory } from "@/types";
import {
  filterAdminConversationRooms,
  loadAdminConversationRooms,
  type AdminConversationCategoryFilter,
  type AdminConversationRoom,
  type AdminConversationTypeFilter,
} from "./admin-data-adapter";
import { AdminError, AdminLoading, AdminPageHeader, AdminState } from "./admin-ui";

const TYPE_FILTERS: readonly AdminConversationTypeFilter[] = [
  "ALL",
  "TALK",
  "READING",
  "GATHERING",
];

const CATEGORY_FILTERS: readonly AdminConversationCategoryFilter[] = [
  "ALL",
  "WORKSHOP",
  "FIELD_TRIP",
  "EXHIBITION",
  "STUDY",
  "DINING",
  "CASUAL",
  "OTHER",
];

function categoryLabel(category: AdminConversationCategoryFilter): string {
  return category === "ALL"
    ? category
    : GATHERING_CATEGORY_LABELS[category as GatheringCategory];
}

function conversationHref(room: AdminConversationRoom): string {
  const base = `/program/${room.snapshot.program.id}?tab=talk`;
  return room.latestMessage
    ? `${base}&message=${encodeURIComponent(room.latestMessage.id)}`
    : base;
}

function ConversationRow({ room }: { room: AdminConversationRoom }) {
  const { program } = room.snapshot;
  const latest = room.latestMessage;

  return (
    <Link className="oa-admin-work-row" href={conversationHref(room)}>
      <span className="oa-admin-work-main">
        <small>
          {formatProgramKind(program)} · {program.code} · {room.snapshot.displayStatus}
        </small>
        <strong>{program.title}</strong>
        <em>{latest?.content ?? "아직 TALK 메시지가 없습니다."}</em>
      </span>

      <span className="oa-admin-work-meta">
        {latest ? (
          <>
            <small>{latest.type}</small>
            <strong>{room.latestAuthorName ?? "UNKNOWN MEMBER"}</strong>
            <time dateTime={latest.createdAt}>
              {formatLongDate(latest.createdAt)} · {formatTime(latest.createdAt)}
            </time>
          </>
        ) : (
          <>
            <small>ACTIVITY</small>
            <strong>NO MESSAGES</strong>
            <span>—</span>
          </>
        )}
      </span>

      <dl className="oa-admin-work-stats">
        <div><dt>MESSAGES</dt><dd>{String(room.messageCount).padStart(2, "0")}</dd></div>
        <div><dt>PINNED</dt><dd>{String(room.pinnedNoticeCount).padStart(2, "0")}</dd></div>
        <div><dt>UNANSWERED</dt><dd>{String(room.unansweredQuestionCount).padStart(2, "0")}</dd></div>
      </dl>

      <span className="oa-admin-work-action">OPEN TALK →</span>
    </Link>
  );
}

export function AdminConversations() {
  const { currentUserId } = useAppState();
  const [typeFilter, setTypeFilter] = useState<AdminConversationTypeFilter>("ALL");
  const [categoryFilter, setCategoryFilter] =
    useState<AdminConversationCategoryFilter>("ALL");
  const query = useCallback(
    (repository: OARepository) => {
      if (!currentUserId) throw new Error("관리자 로그인이 필요합니다.");
      return loadAdminConversationRooms(
        repository,
        currentUserId,
        new Date().toISOString(),
      );
    },
    [currentUserId],
  );
  const { data, loading, error, reload } = useRepositoryQuery(query, [currentUserId]);
  const rooms = useMemo(
    () => filterAdminConversationRooms(data ?? [], typeFilter, categoryFilter),
    [categoryFilter, data, typeFilter],
  );

  return (
    <main className="oa-admin-page">
      <AdminPageHeader
        eyebrow="OA / ADMIN / CONVERSATIONS"
        title="CONVERSATIONS"
        description="Program에 종속된 운영 대화의 공지와 미답변 질문을 확인합니다."
      />

      <div className="oa-admin-toolbar">
        <div className="oa-admin-filters" role="group" aria-label="Program type">
          {TYPE_FILTERS.map((type) => (
            <button
              className="oa-admin-filter"
              type="button"
              aria-pressed={typeFilter === type}
              key={type}
              onClick={() => {
                setTypeFilter(type);
                if (type !== "GATHERING") setCategoryFilter("ALL");
              }}
            >
              {type}
            </button>
          ))}
        </div>

        {typeFilter === "GATHERING" ? (
          <div className="oa-admin-filters" role="group" aria-label="Gathering category">
            {CATEGORY_FILTERS.map((category) => (
              <button
                className="oa-admin-filter"
                type="button"
                aria-pressed={categoryFilter === category}
                key={category}
                onClick={() => setCategoryFilter(category)}
              >
                {categoryLabel(category)}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {data ? (
        <p className="oa-admin-result-summary" role="status" aria-live="polite">
          <span>{String(rooms.length).padStart(2, "0")} ROOMS</span>
          <span>NEWEST ACTIVITY FIRST</span>
        </p>
      ) : null}

      {loading ? <AdminLoading label="Program TALK를 불러오는 중입니다." /> : null}
      {error ? <AdminError message={error.message} onRetry={reload} /> : null}

      {data && data.length === 0 ? (
        <AdminState
          label="CONVERSATIONS / 00"
          title="NO PROGRAM CONVERSATIONS"
          description="확인할 Program TALK가 없습니다."
        />
      ) : null}

      {data && data.length > 0 && rooms.length === 0 ? (
        <AdminState
          label="FILTER / 00"
          title="NO MATCHING PROGRAMS"
          description="선택한 유형에 해당하는 Program TALK가 없습니다."
        />
      ) : null}

      {rooms.length > 0 ? (
        <section className="oa-admin-worklist" aria-label="Program conversations">
          {rooms.map((room) => (
            <ConversationRow room={room} key={room.snapshot.program.id} />
          ))}
        </section>
      ) : null}
    </main>
  );
}
