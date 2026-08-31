"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ConfirmationDialog, LockedState } from "@/components/feedback";
import { OAMiniLogo } from "@/components/oa-mini-logo";
import { useAppState, useRepositoryQuery } from "@/features/app-state/app-state-provider";
import { AddToCalendar } from "@/features/programs/components/add-to-calendar";
import {
  canReactToProgramMessage,
  MessageReactionBar,
  useMessageLongPress,
  type MessageReactionEmoji,
  type MessageReactionSnapshot,
  type MessageReactionUser,
} from "@/features/conversation/reactions";
import {
  getProgramCapabilities,
  getProgramDetailTabs,
  type ProgramCapabilities,
} from "@/features/programs/domain";
import { QueryError, QueryLoading } from "@/features/programs/views/query-state";
import {
  formatCost,
  formatLongDate,
  formatMoney,
  formatProgramKind,
  formatTimeRange,
} from "@/lib/format";
import type { OARepository } from "@/lib/repositories";
import type {
  CreateProgramMessageInput,
  CreateRecordInput,
  CreateRecordMaterialInput,
  MemberDirectoryEntry,
  Participation,
  Program,
  ProgramApproval,
  ProgramMessage,
  ProgramRecordSnapshot,
  ProgramSnapshot,
  User,
} from "@/types";

type DetailTab = "info" | "talk" | "people" | "record";

interface DetailData {
  snapshot: ProgramSnapshot | null;
  recordSnapshot: ProgramRecordSnapshot | null;
  participation: Participation | null;
  approval: ProgramApproval | null;
  viewer: User | null;
  people: MemberDirectoryEntry[];
  messages: ProgramMessage[];
  reactions: MessageReactionSnapshot[];
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="oa-info-row"><dt>{label}</dt><dd>{children}</dd></div>;
}

function ProgramInformation({
  snapshot,
  capabilities,
}: {
  snapshot: ProgramSnapshot;
  capabilities: ProgramCapabilities;
}) {
  const { program, host, participantCounts } = snapshot;
  return (
    <>
      <dl className="oa-info-grid">
        <InfoRow label="WHAT">{formatProgramKind(program)}</InfoRow>
        <InfoRow label="WHEN">
          {formatLongDate(program.startAt)}<br />{formatTimeRange(program.startAt, program.endAt)}
        </InfoRow>
        <InfoRow label="WHERE">
          {program.location}
          {program.mapUrl ? <> · <a href={program.mapUrl} target="_blank" rel="noreferrer">MAP →</a></> : null}
        </InfoRow>
        {program.type === "GATHERING" && program.detail.meetingPoint ? (
          <InfoRow label="MEET">{program.detail.meetingPoint}</InfoRow>
        ) : null}
        {program.capacity !== null ? (
          <InfoRow label="PEOPLE">
            {String(participantCounts.confirmed).padStart(2, "0")} / {String(program.capacity).padStart(2, "0")}
            {participantCounts.waitlist > 0 ? ` · WAITLIST ${participantCounts.waitlist}` : ""}
          </InfoRow>
        ) : null}
        {program.type === "GATHERING" ? (
          <InfoRow label={program.detail.cost.type === "INDIVIDUAL_PURCHASE" ? "TICKET" : "COST"}>
            {formatCost(program)}
            {program.detail.cost.type === "INDIVIDUAL_PURCHASE" && program.detail.cost.purchaseUrl ? (
              <><br /><a href={program.detail.cost.purchaseUrl} target="_blank" rel="noreferrer">PURCHASE →</a></>
            ) : null}
            {program.detail.cost.type === "INDIVIDUAL_PURCHASE" && program.detail.cost.purchaseNote ? (
              <><br />{program.detail.cost.purchaseNote}</>
            ) : null}
          </InfoRow>
        ) : null}
        {program.type === "GATHERING" &&
        program.detail.cost.type === "HOST_COLLECT" &&
        capabilities.canViewPaymentInstructions ? (
          <InfoRow label="PAYMENT">
            {formatMoney(program.detail.cost.participationFee)}
            <br />{program.detail.cost.paymentInfo}
            {program.detail.cost.paymentDeadline ? (
              <><br />DEADLINE · {formatLongDate(program.detail.cost.paymentDeadline)}</>
            ) : null}
            {program.detail.cost.cancellationPolicy ? (
              <><br />CANCELLATION · {program.detail.cost.cancellationPolicy}</>
            ) : null}
          </InfoRow>
        ) : null}
        {program.type === "TALK" ? (
          <InfoRow label="SPEAKER">
            {program.detail.speakerName}
            {program.detail.speakerAffiliation ? ` · ${program.detail.speakerAffiliation}` : ""}
          </InfoRow>
        ) : null}
        <InfoRow label="HOST">{host ? host.name : "OMNIVORE ARCHITECT"}</InfoRow>
      </dl>

      <section className="oa-description" aria-labelledby="description-heading">
        <h2 className="oa-overline" id="description-heading">DESCRIPTION</h2>
        <p>{program.description}</p>
      </section>

      {program.type === "GATHERING" && program.detail.bringItems ? (
        <section className="oa-description" aria-labelledby="bring-heading">
          <h2 className="oa-overline" id="bring-heading">BRING</h2>
          <p>{program.detail.bringItems}</p>
        </section>
      ) : null}

      {program.type === "GATHERING" && program.detail.notice ? (
        <section className="oa-description" aria-labelledby="notice-heading">
          <h2 className="oa-overline" id="notice-heading">NOTICE</h2>
          <p>{program.detail.notice}</p>
        </section>
      ) : null}
    </>
  );
}

const ProgramTalkMessage = memo(function ProgramTalkMessage({
  message,
  authorName,
  capabilities,
  currentUser,
  reactions,
  onToggleReaction,
  onReactionSettled,
  onReactionError,
  onReply,
}: {
  message: ProgramMessage;
  authorName: string;
  capabilities: ProgramCapabilities;
  currentUser: MessageReactionUser;
  reactions: readonly MessageReactionSnapshot[];
  onToggleReaction: (
    messageId: string,
    emoji: MessageReactionEmoji,
  ) => Promise<MessageReactionSnapshot | null>;
  onReactionSettled: (
    messageId: string,
    userId: string,
    reaction: MessageReactionSnapshot | null,
  ) => void;
  onReactionError: (message: string | null) => void;
  onReply: (messageId: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const canReact = canReactToProgramMessage(capabilities, message);
  const longPress = useMessageLongPress({
    enabled: canReact,
    onLongPress: () => setPickerOpen(true),
  });

  return (
    <article
      className="oa-talk-message"
      data-pinned={message.type === "NOTICE" && message.isPinned}
      data-reply={message.parentId !== null}
      data-reaction-open={pickerOpen || undefined}
      id={`message-${message.id}`}
      tabIndex={-1}
      {...longPress}
    >
      <div className="oa-talk-message__meta">
        <span>{message.isPinned ? "PINNED " : ""}{message.type}</span>
        <span>{authorName}</span>
        <time dateTime={message.createdAt}>
          {new Intl.DateTimeFormat("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }).format(new Date(message.createdAt))}
        </time>
      </div>
      <p>{message.content}</p>
      <MessageReactionBar
        messageId={message.id}
        authorName={authorName}
        currentUser={currentUser}
        reactions={reactions}
        canReact={canReact}
        pickerOpen={pickerOpen}
        onPickerOpenChange={setPickerOpen}
        onToggle={onToggleReaction}
        onSettled={onReactionSettled}
        onError={onReactionError}
      />
      {capabilities.canWriteQuestion && message.type === "QUESTION" ? (
        <button className="oa-talk-reply" type="button" onClick={() => onReply(message.id)}>
          REPLY →
        </button>
      ) : null}
    </article>
  );
});

function groupReactionsByMessage(
  reactions: readonly MessageReactionSnapshot[],
): Record<string, MessageReactionSnapshot[]> {
  return reactions.reduce<Record<string, MessageReactionSnapshot[]>>(
    (groups, reaction) => {
      (groups[reaction.messageId] ??= []).push(reaction);
      return groups;
    },
    {},
  );
}

function TalkPanel({
  capabilities,
  program,
  messages,
  reactions,
  authors,
  currentUser,
  repository,
  onPost,
}: {
  capabilities: ProgramCapabilities;
  program: Program;
  messages: ProgramMessage[];
  reactions: MessageReactionSnapshot[];
  authors: MemberDirectoryEntry[];
  currentUser: MessageReactionUser;
  repository: OARepository;
  onPost: (input: CreateProgramMessageInput) => Promise<void>;
}) {
  const [messageType, setMessageType] = useState<CreateProgramMessageInput["type"]>("CHAT");
  const [content, setContent] = useState("");
  const [pinned, setPinned] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [reactionError, setReactionError] = useState<string | null>(null);
  const baseReactionsByMessage = useMemo(
    () => groupReactionsByMessage(reactions),
    [reactions],
  );
  const [reactionOverrides, setReactionOverrides] = useState<
    Record<string, MessageReactionSnapshot[]>
  >({});
  const reactionsByMessage = useMemo(
    () => ({ ...baseReactionsByMessage, ...reactionOverrides }),
    [baseReactionsByMessage, reactionOverrides],
  );

  useEffect(() => {
    if (!capabilities.canAccessTalk) return;
    let active = true;
    const unsubscribe = repository.watchProgramMessages(program.id, (messageId) => {
      void repository
        .listProgramMessageReactions(program.id, currentUser.id, [messageId])
        .then((next) => {
          if (!active) return;
          setReactionOverrides((current) => ({
            ...current,
            [messageId]: next,
          }));
        })
        .catch(() => {
          if (active) {
            setReactionError("반응을 새로 고치지 못했습니다. 연결 상태를 확인해 주세요.");
          }
        });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [capabilities.canAccessTalk, currentUser.id, program.id, repository]);

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !content.trim()) {
      if (!content.trim()) setMessageError("메시지 내용을 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    setMessageError(null);
    try {
      await onPost({
        type: messageType,
        content,
        parentId: replyTo,
        isPinned: messageType === "NOTICE" ? pinned : false,
      });
      setContent("");
      setPinned(false);
      setReplyTo(null);
      setMessageType("CHAT");
    } catch (reason) {
      setMessageError(reason instanceof Error ? reason.message : "메시지를 저장하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  const authorNames = new Map(authors.map((author) => [author.id, author.name]));
  const replyTarget = replyTo
    ? messages.find((message) => message.id === replyTo) ?? null
    : null;
  const toggleReaction = useCallback(
    (messageId: string, emoji: MessageReactionEmoji) =>
      repository.toggleProgramMessageReaction(
        program.id,
        messageId,
        emoji,
        currentUser.id,
        new Date().toISOString(),
      ),
    [currentUser.id, program.id, repository],
  );
  const settleReaction = useCallback((
    messageId: string,
    userId: string,
    reaction: MessageReactionSnapshot | null,
  ) => {
    setReactionOverrides((current) => {
      const withoutUser = (
        current[messageId] ?? baseReactionsByMessage[messageId] ?? []
      ).filter(
        (candidate) => candidate.userId !== userId,
      );
      return {
        ...current,
        [messageId]: reaction ? [...withoutUser, reaction] : withoutUser,
      };
    });
  }, [baseReactionsByMessage]);
  const selectReply = useCallback((messageId: string) => setReplyTo(messageId), []);
  const reportReactionError = useCallback((message: string | null) => {
    setReactionError(message);
  }, []);

  if (!capabilities.canAccessTalk) {
    return (
      <LockedState
        title="PARTICIPANTS ONLY"
        description={"이 대화방은 참가자와 운영진만\n이용할 수 있습니다."}
        action={program.type === "GATHERING" && capabilities.canJoin ? <Link className="oa-label" href={`/program/${program.id}?tab=info#join`}>JOIN GATHERING →</Link> : null}
      />
    );
  }

  return (
    <section className="oa-talk" aria-labelledby="program-talk-heading">
      <div className="oa-section-heading">
        <h2 id="program-talk-heading">TALK</h2>
        <span className="oa-label">{capabilities.canWriteChat ? "ACTIVE" : "READ ONLY"}</span>
      </div>

      {messages.length ? (
        <div className="oa-talk-list">
          {messages.map((message) => (
            <ProgramTalkMessage
              key={message.id}
              message={message}
              authorName={authorNames.get(message.authorId) ?? "MEMBER"}
              capabilities={capabilities}
              currentUser={currentUser}
              reactions={reactionsByMessage[message.id] ?? []}
              onToggleReaction={toggleReaction}
              onReactionSettled={settleReaction}
              onReactionError={reportReactionError}
              onReply={selectReply}
            />
          ))}
        </div>
      ) : (
        <p className="oa-empty">아직 대화가 없습니다. Program 운영에 필요한 내용부터 남겨 주세요.</p>
      )}

      <p className="oa-visually-hidden" role="status" aria-live="polite">
        {reactionError ?? ""}
      </p>

      {capabilities.canWriteChat ? (
        <form className="oa-talk-composer" onSubmit={submitMessage} noValidate>
          {replyTarget ? (
            <div className="oa-talk-replying" role="status">
              <span>REPLY / {authorNames.get(replyTarget.authorId) ?? "MEMBER"}</span>
              <button type="button" onClick={() => setReplyTo(null)}>CANCEL</button>
            </div>
          ) : null}
          <div className="oa-field-grid">
            <div className="oa-field">
              <label htmlFor="message-type">TYPE</label>
              <select
                id="message-type"
                value={messageType}
                onChange={(event) => {
                  const nextType = event.target.value as CreateProgramMessageInput["type"];
                  setMessageType(nextType);
                  if (nextType !== "NOTICE") setPinned(false);
                }}
              >
                <option value="CHAT">CHAT</option>
                <option value="QUESTION">QUESTION</option>
                {capabilities.canWriteNotice ? <option value="NOTICE">NOTICE</option> : null}
              </select>
            </div>
            {messageType === "NOTICE" ? (
              <label className="oa-choice oa-talk-pin">
                <input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} />
                <span>PIN NOTICE</span>
              </label>
            ) : null}
          </div>
          <div className="oa-field">
            <label htmlFor="message-content">MESSAGE</label>
            <textarea
              id="message-content"
              value={content}
              onChange={(event) => {
                setContent(event.target.value);
                setMessageError(null);
              }}
              placeholder={messageType === "NOTICE" ? "중요 공지를 입력하세요." : "Program 운영 대화를 입력하세요."}
              aria-invalid={Boolean(messageError)}
              aria-describedby={messageError ? "message-error" : undefined}
              required
            />
          </div>
          {messageError ? <p className="oa-flash" id="message-error" role="alert">{messageError}</p> : null}
          <button className="oa-primary-button" type="submit" disabled={submitting}>
            {submitting ? "POSTING…" : `POST ${messageType} →`}
          </button>
        </form>
      ) : (
        <p className="oa-field-help">취소 참가자와 취소된 Program은 기존 대화만 읽을 수 있습니다.</p>
      )}
    </section>
  );
}

function PeoplePanel({ people, snapshot }: { people: MemberDirectoryEntry[]; snapshot: ProgramSnapshot }) {
  return (
    <section>
      <div className="oa-section-heading"><h2>PEOPLE</h2><span className="oa-label">{snapshot.participantCounts.confirmed} CONFIRMED</span></div>
      {people.length ? (
        <div className="oa-editorial-list">
          {people.map((person) => (
            <div className="oa-info-row" key={person.id}>
              <span className="oa-label">MEMBER</span>
              <span>{person.name}</span>
            </div>
          ))}
        </div>
      ) : <p className="oa-empty">아직 공개할 참가자가 없습니다.</p>}
      <p className="oa-field-help">참가자의 납부 상태는 Host와 Admin에게만 표시됩니다.</p>
    </section>
  );
}

function RecordPanel({
  program,
  snapshot,
  editable,
  onEdit,
}: {
  program: Program;
  snapshot: ProgramRecordSnapshot;
  editable: boolean;
  onEdit: () => void;
}) {
  const { record, materials } = snapshot;
  return (
    <article className="oa-record-detail">
      <p className="oa-overline">RECORD / {program.code.replace(/^OA\s*\/\s*/, "")}</p>
      {editable ? (
        <button className="oa-inline-action" type="button" onClick={onEdit}>
          EDIT RECORD →
        </button>
      ) : null}
      <section className="oa-record-detail__section" aria-labelledby="record-what">
        <h2 className="oa-overline" id="record-what">WHAT</h2>
        <p>{record.what}</p>
      </section>
      {record.found ? (
        <section className="oa-record-detail__section" aria-labelledby="record-found">
          <h2 className="oa-overline" id="record-found">FOUND</h2>
          <p>{record.found}</p>
        </section>
      ) : null}
      {materials.length > 0 ? (
        <section className="oa-record-detail__section" aria-labelledby="record-material">
          <h2 className="oa-overline" id="record-material">MATERIAL</h2>
          <ul className="oa-record-material-list">
            {materials.map((material) => (
              <li key={material.id}>
                {material.url ? (
                  <a href={material.url} target="_blank" rel="noreferrer">
                    {material.label ?? `[${material.type}]`} <span aria-hidden="true">→</span>
                  </a>
                ) : (
                  <span>{material.label ?? `[${material.type}]`}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <footer className="oa-record-footer">
        <OAMiniLogo className="h-[10px] w-5" />
        <span>OMNIVORE ARCHITECT / RECORD</span>
      </footer>
    </article>
  );
}

export default function ProgramDetailPage() {
  const params = useParams<{ programId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { repository, currentUserId, sessionLoading } = useAppState();
  const [confirming, setConfirming] = useState(false);
  const [confirmingCancellation, setConfirmingCancellation] = useState(false);
  const [joining, setJoining] = useState(false);
  const [cancellingParticipation, setCancellingParticipation] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [participationMessage, setParticipationMessage] = useState<string | null>(null);
  const [recordWhat, setRecordWhat] = useState("");
  const [recordFound, setRecordFound] = useState("");
  const [recordMaterialType, setRecordMaterialType] = useState<"LINK" | "REFERENCE">("LINK");
  const [recordMaterialUrl, setRecordMaterialUrl] = useState("");
  const [recordSubmitting, setRecordSubmitting] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [recordCreated, setRecordCreated] = useState(false);
  const [editingRecord, setEditingRecord] = useState(false);
  const programId = params.programId;

  const query = useCallback(async (repo: OARepository): Promise<DetailData> => {
    const requestedAt = new Date().toISOString();
    const [snapshot, recordSnapshot, participation, approval, viewer] = await Promise.all([
      repo.getProgramSnapshotById(programId, requestedAt, currentUserId),
      repo.getRecordSnapshotByProgramId(programId),
      currentUserId ? repo.getParticipation(programId, currentUserId) : Promise.resolve(null),
      currentUserId ? repo.getProgramApproval(programId, currentUserId) : Promise.resolve(null),
      currentUserId ? repo.getUserById(currentUserId) : Promise.resolve(null),
    ]);
    const canReadTalk = snapshot
      ? getProgramCapabilities({
          user: viewer,
          program: snapshot.program,
          participation,
          approval,
          record: snapshot.record,
          participantCounts: snapshot.participantCounts,
          now: requestedAt,
        }).canAccessTalk
      : false;
    const [messages, people, reactions] = canReadTalk && currentUserId
      ? await Promise.all([
          repo.listProgramMessages(programId, currentUserId),
          repo.listConfirmedParticipantUsers(programId, currentUserId),
          repo.listProgramMessageReactions(programId, currentUserId),
        ])
      : [[], [], []];
    return {
      snapshot,
      recordSnapshot,
      participation,
      approval,
      viewer,
      people,
      messages,
      reactions,
    };
  }, [currentUserId, programId]);
  const { data, loading, error, reload } = useRepositoryQuery(query, [currentUserId, programId]);

  const canWatchTalk = Boolean(
    currentUserId &&
    data?.snapshot &&
    getProgramCapabilities({
      user: data.viewer,
      program: data.snapshot.program,
      participation: data.participation,
      approval: data.approval,
      record: data.snapshot.record,
      participantCounts: data.snapshot.participantCounts,
    }).canAccessTalk,
  );

  useEffect(() => {
    if (!canWatchTalk) return;
    return repository.watchProgramMessages(programId);
  }, [canWatchTalk, programId, repository]);

  const tabs: DetailTab[] = data?.snapshot
    ? getProgramDetailTabs(data.snapshot.program).map(
        (item) => item.toLowerCase() as DetailTab,
      )
    : ["info", "talk", "people"];
  const requestedTab = searchParams.get("tab") as DetailTab | null;
  const tab = requestedTab && tabs.includes(requestedTab) ? requestedTab : "info";
  const targetMessageId = searchParams.get("message");

  useEffect(() => {
    if (tab !== "talk" || !targetMessageId || loading) return;
    const target = document.getElementById(`message-${targetMessageId}`);
    if (!target) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({
      block: "center",
      behavior: reduceMotion ? "auto" : "smooth",
    });
    target.focus({ preventScroll: true });
  }, [loading, tab, targetMessageId]);

  if (loading || sessionLoading) return <main className="oa-page"><QueryLoading /></main>;
  if (error) return <main className="oa-page"><QueryError message={error.message} onRetry={reload} /></main>;
  if (!data?.snapshot) {
    return (
      <main className="oa-page">
        <QueryError
          title="PROGRAM NOT FOUND"
          message="요청한 Program을 찾을 수 없습니다. 삭제되었거나 공개되지 않은 Program일 수 있습니다."
          retry={false}
          action={<Link className="oa-label" href="/programs">BACK TO PROGRAMS →</Link>}
        />
      </main>
    );
  }

  const { snapshot, recordSnapshot, participation, approval, viewer } = data;
  const { program } = snapshot;
  const capabilities = getProgramCapabilities({
    user: viewer,
    program,
    participation,
    approval,
    record: snapshot.record,
    participantCounts: snapshot.participantCounts,
  });

  async function join() {
    if (!capabilities.canJoin || joining || !currentUserId) return;
    setJoining(true);
    setJoinError(null);
    try {
      const outcome = await repository.joinProgram(program.id, currentUserId, new Date().toISOString());
      router.push(`/my?joined=${program.id}&status=${outcome.placement.toLowerCase()}`);
    } catch (reason) {
      setJoinError(reason instanceof Error ? reason.message : "참여 신청을 완료하지 못했습니다.");
      setConfirming(false);
      setJoining(false);
    }
  }

  async function cancelParticipation() {
    if (
      !capabilities.canCancelParticipation ||
      cancellingParticipation ||
      !currentUserId
    ) return;
    setCancellingParticipation(true);
    setJoinError(null);
    try {
      await repository.cancelParticipation(
        program.id,
        currentUserId,
        new Date().toISOString(),
      );
      setParticipationMessage("참여가 취소되었습니다. 기존 TALK는 읽기 전용으로 유지됩니다.");
      setConfirmingCancellation(false);
    } catch (reason) {
      setJoinError(reason instanceof Error ? reason.message : "참여를 취소하지 못했습니다.");
    } finally {
      setCancellingParticipation(false);
    }
  }

  async function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const existingRecord = recordSnapshot;
    const canSave = existingRecord
      ? editingRecord && capabilities.canEditRecord
      : capabilities.canWriteRecord;
    if (!canSave || recordSubmitting || !currentUserId) return;
    if (!recordWhat.trim()) {
      setRecordError("WHAT을 입력해 주세요.");
      return;
    }
    setRecordSubmitting(true);
    setRecordError(null);
    try {
      const preservedMaterials =
        existingRecord?.materials.reduce<CreateRecordMaterialInput[]>((items, material) => {
          if (material.type === "PHOTO" && material.mediaId) {
            items.push({ type: "PHOTO", mediaId: material.mediaId, label: material.label });
          }
          if ((material.type === "LINK" || material.type === "REFERENCE") && material.url) {
            items.push({ type: material.type, url: material.url, label: material.label });
          }
          return items;
        }, []) ?? [];
      const input: CreateRecordInput = {
        what: recordWhat,
        found: recordFound || null,
        materials: existingRecord
          ? preservedMaterials
          : recordMaterialUrl.trim()
            ? [{ type: recordMaterialType, url: recordMaterialUrl }]
            : [],
      };
      if (existingRecord) {
        await repository.updateRecord(
          program.id,
          input,
          currentUserId,
          new Date().toISOString(),
        );
      } else {
        await repository.createRecord(
          program.id,
          input,
          currentUserId,
          new Date().toISOString(),
        );
      }
      setRecordCreated(true);
      setEditingRecord(false);
      router.replace(`/program/${program.id}?tab=record&record=saved`);
    } catch (reason) {
      setRecordError(reason instanceof Error ? reason.message : "Record를 저장하지 못했습니다.");
    } finally {
      setRecordSubmitting(false);
    }
  }

  function beginRecordEdit() {
    if (!recordSnapshot || !capabilities.canEditRecord) return;
    setRecordWhat(recordSnapshot.record.what);
    setRecordFound(recordSnapshot.record.found ?? "");
    setRecordError(null);
    setEditingRecord(true);
  }

  async function postMessage(input: CreateProgramMessageInput) {
    if (!currentUserId) throw new Error("로그인이 필요합니다.");
    await repository.postProgramMessage(
      program.id,
      input,
      currentUserId,
      new Date().toISOString(),
    );
  }

  return (
    <main className="oa-page oa-page--narrow">
      <div className="oa-detail-code">
        <span className="oa-overline">{formatProgramKind(program)}</span>
        <span className="oa-overline">{program.code}</span>
      </div>
      <h1 className="oa-page-title oa-page-title--detail oa-detail-title-reveal">{program.title}</h1>
      <p className="oa-detail-date">
        {formatLongDate(program.startAt)}
        <span>{formatTimeRange(program.startAt, program.endAt)}</span>
      </p>
      <p className="oa-status">{snapshot.displayStatus.replaceAll("_", " ")}</p>
      {participation ? <p className="oa-meta oa-muted">PARTICIPATION / {participation.status}</p> : null}
      <div className="oa-detail-secondary-action">
        <AddToCalendar program={program} />
      </div>

      <nav className="oa-tabs" aria-label="Program detail tabs">
        {tabs.map((item) => (
          <Link
            href={`/program/${program.id}?tab=${item}`}
            key={item}
            aria-current={tab === item ? "page" : undefined}
          >
            {item.toUpperCase()}
          </Link>
        ))}
      </nav>

      {tab === "info" ? <ProgramInformation snapshot={snapshot} capabilities={capabilities} /> : null}
      {tab === "talk" ? (
        <TalkPanel
          key={program.id}
          capabilities={capabilities}
          program={program}
          messages={data.messages}
          reactions={data.reactions}
          authors={[
            ...data.people,
            ...(snapshot.host ? [snapshot.host] : []),
            ...(viewer ? [viewer] : []),
          ]}
          currentUser={{
            id: viewer?.id ?? "anonymous",
            name: viewer?.name ?? "MEMBER",
            imageUrl: viewer?.imageUrl ?? null,
            seasons: [],
          }}
          repository={repository}
          onPost={postMessage}
        />
      ) : null}
      {tab === "people" ? <PeoplePanel people={data.people} snapshot={snapshot} /> : null}
      {tab === "record" ? (
        data.recordSnapshot && !editingRecord ? (
          <RecordPanel
            program={program}
            snapshot={data.recordSnapshot}
            editable={capabilities.canEditRecord}
            onEdit={beginRecordEdit}
          />
        ) : capabilities.canWriteRecord || (editingRecord && capabilities.canEditRecord) ? (
          <form className="oa-record-form" onSubmit={saveRecord} noValidate>
            <div className="oa-section-heading">
              <h2>{editingRecord ? "EDIT RECORD" : "30 SECOND RECORD"}</h2>
              <span className="oa-label">WHAT REQUIRED</span>
            </div>
            <div className="oa-field-stack">
              <div className="oa-field">
                <label htmlFor="record-what">WHAT</label>
                <textarea
                  id="record-what"
                  value={recordWhat}
                  onChange={(event) => setRecordWhat(event.target.value)}
                  placeholder="무엇을 했나요?"
                  aria-describedby="record-what-help"
                  required
                />
                <p className="oa-field-help" id="record-what-help">1–3문장만으로 완료할 수 있습니다.</p>
              </div>
              <div className="oa-field">
                <label htmlFor="record-found">FOUND <span>OPTIONAL</span></label>
                <textarea
                  id="record-found"
                  value={recordFound}
                  onChange={(event) => setRecordFound(event.target.value)}
                  placeholder="무엇을 발견했나요?"
                />
              </div>
              {!editingRecord ? (
                <fieldset className="oa-fieldset">
                  <legend>MATERIAL <span>OPTIONAL</span></legend>
                  <div className="oa-field-grid">
                    <div className="oa-field">
                      <label htmlFor="record-material-type">TYPE</label>
                      <select
                        id="record-material-type"
                        value={recordMaterialType}
                        onChange={(event) => setRecordMaterialType(event.target.value as "LINK" | "REFERENCE")}
                      >
                        <option value="LINK">LINK</option>
                        <option value="REFERENCE">REFERENCE</option>
                      </select>
                    </div>
                    <div className="oa-field">
                      <label htmlFor="record-material-url">URL</label>
                      <input
                        id="record-material-url"
                        type="url"
                        value={recordMaterialUrl}
                        onChange={(event) => setRecordMaterialUrl(event.target.value)}
                        placeholder="https://"
                      />
                    </div>
                  </div>
                </fieldset>
              ) : null}
            </div>
            {recordError ? <p className="oa-flash" role="alert">{recordError}</p> : null}
            <div className="oa-form-actions">
              {editingRecord ? (
                <button className="oa-secondary-button" type="button" onClick={() => setEditingRecord(false)}>
                  CANCEL
                </button>
              ) : null}
              <button className="oa-primary-button" type="submit" disabled={recordSubmitting}>
                {recordSubmitting ? "SAVING…" : editingRecord ? "UPDATE RECORD →" : "SAVE RECORD →"}
              </button>
            </div>
          </form>
        ) : (
          <section className="oa-locked"><p className="oa-overline">RECORD REQUIRED</p><h2>30초 기록이<br />필요합니다.</h2></section>
        )
      ) : null}

      {recordCreated || searchParams.get("record") === "saved" ? <p className="oa-flash" role="status">Record가 저장되었습니다.</p> : null}
      {participationMessage ? <p className="oa-flash" role="status">{participationMessage}</p> : null}
      {joinError ? <p className="oa-flash" role="alert">{joinError}</p> : null}
      {capabilities.canJoin ? (
        <div className="oa-action-bar" id="join">
          <button type="button" onClick={() => setConfirming(true)}>JOIN →</button>
        </div>
      ) : capabilities.canCancelParticipation ? (
        <div className="oa-action-bar">
          <button type="button" onClick={() => setConfirmingCancellation(true)}>CANCEL PARTICIPATION →</button>
        </div>
      ) : null}
      <ConfirmationDialog
        open={confirming}
        eyebrow="JOIN GATHERING"
        title="참여하시겠습니까?"
        description={`${program.title}의 운영 대화는 참여 확정 후 이용할 수 있습니다.`}
        confirmLabel="CONFIRM JOIN"
        pending={joining}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void join()}
      />
      <ConfirmationDialog
        open={confirmingCancellation}
        eyebrow="CANCEL PARTICIPATION"
        title="참여를 취소할까요?"
        description="새 메시지는 작성할 수 없지만 기존 Program TALK는 읽을 수 있습니다."
        confirmLabel="CANCEL PARTICIPATION"
        cancelLabel="KEEP MY PLACE"
        pending={cancellingParticipation}
        onCancel={() => setConfirmingCancellation(false)}
        onConfirm={() => void cancelParticipation()}
      />
    </main>
  );
}
