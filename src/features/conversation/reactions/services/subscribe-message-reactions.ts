import type { MessageReactionChangeListener } from "../types/message-reaction";

export interface MessageReactionSubscriptionPort {
  watch(listener: MessageReactionChangeListener): () => void;
}

export function subscribeMessageReactions(
  port: MessageReactionSubscriptionPort,
  listener: MessageReactionChangeListener,
): () => void {
  return port.watch(listener);
}
