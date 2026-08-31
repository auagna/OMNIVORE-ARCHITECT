export const MESSAGE_REACTION_EMOJIS = [
  "👍",
  "❤️",
  "😂",
  "😮",
  "👏",
  "✅",
] as const;

export type MessageReactionEmoji =
  (typeof MESSAGE_REACTION_EMOJIS)[number];

export const MESSAGE_REACTION_LABELS: Record<MessageReactionEmoji, string> = {
  "👍": "공감",
  "❤️": "마음",
  "😂": "웃음",
  "😮": "놀람",
  "👏": "박수",
  "✅": "확인",
};

export function isMessageReactionEmoji(
  value: unknown,
): value is MessageReactionEmoji {
  return (
    typeof value === "string" &&
    (MESSAGE_REACTION_EMOJIS as readonly string[]).includes(value)
  );
}
