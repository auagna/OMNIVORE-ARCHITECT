"use client";

import { forwardRef } from "react";

interface MessageReactionTriggerProps {
  authorName: string;
  expanded: boolean;
  onClick: () => void;
}

export const MessageReactionTrigger = forwardRef<
  HTMLButtonElement,
  MessageReactionTriggerProps
>(function MessageReactionTrigger(
  { authorName, expanded, onClick },
  ref,
) {
  return (
    <button
      ref={ref}
      className="oa-reaction-trigger"
      type="button"
      aria-label={`${authorName}의 메시지에 반응 추가`}
      aria-expanded={expanded}
      onClick={onClick}
    >
      <span aria-hidden="true">☺</span>
    </button>
  );
});
