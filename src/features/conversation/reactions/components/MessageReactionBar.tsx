"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MessageReactionEmoji } from "../../constants/message-reactions";
import { groupMessageReactions } from "../domain/group-message-reactions";
import type {
  MessageReactionSnapshot,
  MessageReactionUser,
} from "../types/message-reaction";
import { MessageReactionChip } from "./MessageReactionChip";
import { MessageReactionPicker } from "./MessageReactionPicker";
import { MessageReactionTrigger } from "./MessageReactionTrigger";
import { MessageReactionUsersSheet } from "./MessageReactionUsersSheet";

const NO_REACTIONS: readonly MessageReactionSnapshot[] = [];

interface MessageReactionBarProps {
  messageId: string;
  authorName: string;
  currentUser: MessageReactionUser;
  reactions?: readonly MessageReactionSnapshot[];
  canReact: boolean;
  pickerOpen: boolean;
  onPickerOpenChange: (open: boolean) => void;
  onToggle: (
    messageId: string,
    emoji: MessageReactionEmoji,
  ) => Promise<MessageReactionSnapshot | null>;
  onSettled: (
    messageId: string,
    userId: string,
    reaction: MessageReactionSnapshot | null,
  ) => void;
  onError: (message: string | null) => void;
}

export function MessageReactionBar({
  messageId,
  authorName,
  currentUser,
  reactions = NO_REACTIONS,
  canReact,
  pickerOpen,
  onPickerOpenChange,
  onToggle,
  onSettled,
  onError,
}: MessageReactionBarProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const detailsRef = useRef<HTMLButtonElement>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [optimisticEmoji, setOptimisticEmoji] = useState<
    MessageReactionEmoji | null | undefined
  >(undefined);
  const [persistedEmoji, setPersistedEmoji] = useState<MessageReactionEmoji | null>(
    reactions.find((reaction) => reaction.userId === currentUser.id)?.emoji ?? null,
  );
  const [saving, setSaving] = useState(false);
  const processingRef = useRef(false);
  const desiredRef = useRef<MessageReactionEmoji | null>(null);
  const persistedRef = useRef<MessageReactionEmoji | null>(
    reactions.find((reaction) => reaction.userId === currentUser.id)?.emoji ?? null,
  );

  useEffect(() => {
    if (processingRef.current) return;
    const persisted =
      reactions.find((reaction) => reaction.userId === currentUser.id)?.emoji ?? null;
    persistedRef.current = persisted;
    desiredRef.current = persisted;
    setPersistedEmoji(persisted);
    setOptimisticEmoji(undefined);
  }, [currentUser.id, reactions]);

  const displayedReactions = useMemo(() => {
    if (optimisticEmoji === undefined) return reactions;
    const others = reactions.filter(
      (reaction) => reaction.userId !== currentUser.id,
    );
    if (optimisticEmoji === null) return others;
    const existing = reactions.find(
      (reaction) => reaction.userId === currentUser.id,
    );
    return [
      ...others,
      {
        id: existing?.id ?? `optimistic-${messageId}-${currentUser.id}`,
        programId: existing?.programId ?? "optimistic",
        messageId,
        userId: currentUser.id,
        emoji: optimisticEmoji,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        user: currentUser,
      },
    ];
  }, [currentUser, messageId, optimisticEmoji, reactions]);
  const groups = useMemo(
    () => groupMessageReactions(displayedReactions, currentUser.id),
    [currentUser.id, displayedReactions],
  );
  const selectedEmoji =
    optimisticEmoji === undefined ? persistedEmoji : optimisticEmoji;

  const closePicker = useCallback((restoreFocus: boolean) => {
    onPickerOpenChange(false);
    if (restoreFocus) window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, [onPickerOpenChange]);

  const drainQueue = useCallback(async function drain(): Promise<void> {
    if (processingRef.current) return;
    processingRef.current = true;
    setSaving(true);
    try {
      while (desiredRef.current !== persistedRef.current) {
        const commandEmoji = desiredRef.current ?? persistedRef.current;
        if (!commandEmoji) break;
        const result = await onToggle(messageId, commandEmoji);
        persistedRef.current = result?.emoji ?? null;
        setPersistedEmoji(result?.emoji ?? null);
        onSettled(messageId, currentUser.id, result);
      }
      setOptimisticEmoji(undefined);
    } catch (reason) {
      desiredRef.current = persistedRef.current;
      setOptimisticEmoji(undefined);
      onError(
        reason instanceof Error
          ? reason.message
          : "반응을 저장하지 못했습니다. 다시 시도해 주세요.",
      );
    } finally {
      processingRef.current = false;
      setSaving(false);
      if (desiredRef.current !== persistedRef.current) void drain();
    }
  }, [currentUser.id, messageId, onError, onSettled, onToggle]);

  function selectEmoji(emoji: MessageReactionEmoji) {
    if (!canReact) return;
    onError(null);
    const effective =
      optimisticEmoji === undefined ? persistedRef.current : optimisticEmoji;
    const desired = effective === emoji ? null : emoji;
    desiredRef.current = desired;
    setOptimisticEmoji(desired);
    closePicker(true);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(8);
    }
    void drainQueue();
  }

  if (!canReact && groups.length === 0) return null;

  const total = groups.reduce((sum, group) => sum + group.count, 0);
  return (
    <div className="oa-reaction-area" data-pending={saving || undefined}>
      {groups.length ? (
        <div className="oa-reaction-row">
          {groups.map((group) => (
            <MessageReactionChip
              key={group.emoji}
              group={group}
              canReact={canReact}
              onToggle={() => selectEmoji(group.emoji)}
            />
          ))}
          <button
            ref={detailsRef}
            className="oa-reaction-details"
            type="button"
            aria-label={`반응한 사람 ${total}명 보기`}
            onClick={() => setDetailsOpen(true)}
          >
            WHO / {String(total).padStart(2, "0")} →
          </button>
        </div>
      ) : null}
      {canReact ? (
        <div className="oa-reaction-control">
          <MessageReactionTrigger
            ref={triggerRef}
            authorName={authorName}
            expanded={pickerOpen}
            onClick={() => onPickerOpenChange(!pickerOpen)}
          />
          <MessageReactionPicker
            open={pickerOpen}
            selectedEmoji={selectedEmoji}
            anchorRef={triggerRef}
            onSelect={selectEmoji}
            onClose={closePicker}
          />
        </div>
      ) : null}
      <MessageReactionUsersSheet
        open={detailsOpen}
        groups={groups}
        returnFocusRef={detailsRef}
        onOpenChange={setDetailsOpen}
      />
    </div>
  );
}
