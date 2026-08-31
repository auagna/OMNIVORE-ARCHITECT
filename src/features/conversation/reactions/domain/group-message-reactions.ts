import { MESSAGE_REACTION_EMOJIS } from "../../constants/message-reactions";
import type {
  MessageReactionGroup,
  MessageReactionSnapshot,
} from "../types/message-reaction";

export function groupMessageReactions(
  reactions: readonly MessageReactionSnapshot[],
  currentUserId: string | null,
): MessageReactionGroup[] {
  return MESSAGE_REACTION_EMOJIS.flatMap((emoji) => {
    const matching = reactions.filter((reaction) => reaction.emoji === emoji);
    if (matching.length === 0) return [];
    return [{
      emoji,
      count: matching.length,
      reactedByCurrentUser:
        currentUserId !== null &&
        matching.some((reaction) => reaction.userId === currentUserId),
      users: matching.map((reaction) => reaction.user),
    }];
  });
}
