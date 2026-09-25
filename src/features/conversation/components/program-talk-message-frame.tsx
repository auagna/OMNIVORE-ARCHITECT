import type { HTMLAttributes, ReactNode } from "react";
import type { ProgramMessage } from "@/types";

type TalkMessageSummary = Pick<
  ProgramMessage,
  "id" | "type" | "content" | "parentId" | "isPinned" | "createdAt"
>;

export interface ProgramTalkMessageFrameProps
  extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  message: TalkMessageSummary;
  authorName: string;
  reactionOpen?: boolean;
  children?: ReactNode;
}

export function ProgramTalkMessageFrame({
  message,
  authorName,
  reactionOpen = false,
  children,
  id,
  ...articleProps
}: ProgramTalkMessageFrameProps) {
  return (
    <article
      className="oa-talk-message"
      data-pinned={message.type === "NOTICE" && message.isPinned}
      data-reply={message.parentId !== null}
      data-reaction-open={reactionOpen || undefined}
      id={id ?? `message-${message.id}`}
      tabIndex={-1}
      {...articleProps}
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
      {children}
    </article>
  );
}
