"use client";

import { MESSAGE_REACTION_LABELS } from "../../constants/message-reactions";
import type { MessageReactionGroup } from "../types/message-reaction";

interface MessageReactionChipProps {
  group: MessageReactionGroup;
  canReact: boolean;
  onToggle: () => void;
}

export function MessageReactionChip({
  group,
  canReact,
  onToggle,
}: MessageReactionChipProps) {
  const label = MESSAGE_REACTION_LABELS[group.emoji];
  const content = (
    <>
      <span aria-hidden="true">{group.emoji}</span>
      <span aria-hidden="true">{group.count}</span>
    </>
  );

  if (!canReact) {
    return (
      <span
        className="oa-reaction-chip"
        aria-label={`${label} 반응 ${group.count}개`}
      >
        {content}
      </span>
    );
  }

  return (
    <button
      className="oa-reaction-chip"
      type="button"
      data-active={group.reactedByCurrentUser}
      aria-pressed={group.reactedByCurrentUser}
      aria-label={
        group.reactedByCurrentUser
          ? `내 ${label} 반응 제거, 현재 ${group.count}명`
          : `${label} 반응 추가, 현재 ${group.count}명`
      }
      onClick={onToggle}
    >
      {content}
    </button>
  );
}
