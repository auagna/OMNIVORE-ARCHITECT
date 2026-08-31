import type { MessageReactionEmoji } from "../../constants/message-reactions";

export interface MessageReaction {
  id: string;
  programId: string;
  messageId: string;
  userId: string;
  emoji: MessageReactionEmoji;
  createdAt: string;
  updatedAt: string;
}

export interface MessageReactionUser {
  id: string;
  name: string;
  imageUrl?: string | null;
  seasons: string[];
}

export interface MessageReactionSnapshot extends MessageReaction {
  user: MessageReactionUser;
}

export interface MessageReactionGroup {
  emoji: MessageReactionEmoji;
  count: number;
  reactedByCurrentUser: boolean;
  users: MessageReactionUser[];
}

export type MessageReactionChangeListener = (messageId: string) => void;
