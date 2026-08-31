import type { MessageReactionEmoji } from "../../constants/message-reactions";
import type { MessageReactionSnapshot } from "../types/message-reaction";

export interface MessageReactionTogglePort {
  toggle(
    messageId: string,
    emoji: MessageReactionEmoji,
  ): Promise<MessageReactionSnapshot | null>;
}

/** Keeps the component independent from the transport used in mock and Supabase modes. */
export async function toggleMessageReaction(
  port: MessageReactionTogglePort,
  messageId: string,
  emoji: MessageReactionEmoji,
): Promise<MessageReactionSnapshot | null> {
  return port.toggle(messageId, emoji);
}
