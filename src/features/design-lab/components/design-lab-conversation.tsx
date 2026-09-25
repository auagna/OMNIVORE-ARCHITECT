"use client";

import { useCallback, useRef, useState } from "react";
import { ProgramTalkMessageFrame } from "@/features/conversation/components/program-talk-message-frame";
import {
  MessageReactionBar,
  type MessageReactionEmoji,
  type MessageReactionSnapshot,
} from "@/features/conversation/reactions";
import {
  designLabCurrentUser,
  designLabInitialReactions,
  designLabMessages,
} from "../fixtures";

const authorNames: Record<string, string> = {
  "design-lab-host": "김유진 · HOST",
  "design-lab-user-2": "김민지",
  "design-lab-current-user": "최유진",
};

export function DesignLabConversation() {
  const [reactions, setReactions] = useState(designLabInitialReactions);
  const reactionsRef = useRef(reactions);
  const [openPickerId, setOpenPickerId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const toggleReaction = useCallback(async (
    messageId: string,
    emoji: MessageReactionEmoji,
  ): Promise<MessageReactionSnapshot | null> => {
    const current = reactionsRef.current;
    const existing = current.find(
      (reaction) =>
        reaction.messageId === messageId &&
        reaction.userId === designLabCurrentUser.id,
    );
    const nextReaction = existing?.emoji === emoji
      ? null
      : {
          id: existing?.id ?? `design-lab-reaction-${messageId}`,
          programId: "design-lab-gathering-exhibition",
          messageId,
          userId: designLabCurrentUser.id,
          emoji,
          createdAt: existing?.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          user: designLabCurrentUser,
        } satisfies MessageReactionSnapshot;
    const next = [
      ...current.filter(
        (reaction) =>
          !(
            reaction.messageId === messageId &&
            reaction.userId === designLabCurrentUser.id
          ),
      ),
      ...(nextReaction ? [nextReaction] : []),
    ];
    reactionsRef.current = next;
    setReactions(next);
    return nextReaction;
  }, []);

  return (
    <div className="oa-talk-list">
      {designLabMessages.map((talkMessage) => (
        <ProgramTalkMessageFrame
          key={talkMessage.id}
          message={talkMessage}
          authorName={authorNames[talkMessage.authorId] ?? "MEMBER"}
          reactionOpen={openPickerId === talkMessage.id}
        >
          <MessageReactionBar
            messageId={talkMessage.id}
            authorName={authorNames[talkMessage.authorId] ?? "MEMBER"}
            currentUser={designLabCurrentUser}
            reactions={reactions.filter(
              (reaction) => reaction.messageId === talkMessage.id,
            )}
            canReact
            pickerOpen={openPickerId === talkMessage.id}
            onPickerOpenChange={(open) => setOpenPickerId(open ? talkMessage.id : null)}
            onToggle={toggleReaction}
            onSettled={() => undefined}
            onError={setMessage}
          />
          {talkMessage.type === "QUESTION" ? (
            <button className="oa-talk-reply" type="button">REPLY →</button>
          ) : null}
        </ProgramTalkMessageFrame>
      ))}
      <p className="oa-visually-hidden" role="status" aria-live="polite">
        {message ?? ""}
      </p>
    </div>
  );
}
