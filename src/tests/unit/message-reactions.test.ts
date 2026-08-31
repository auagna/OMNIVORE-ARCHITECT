import { describe, expect, it } from "vitest";

import {
  MESSAGE_REACTION_EMOJIS,
  MESSAGE_REACTION_LABELS,
  canReactToProgramMessage,
  groupMessageReactions,
  isMessageReactionEmoji,
  type MessageReactionEmoji,
  type MessageReactionSnapshot,
} from "@/features/conversation/reactions";
import type { ProgramMessage } from "@/types";

function reaction(
  emoji: MessageReactionEmoji,
  userId: string,
  name: string,
): MessageReactionSnapshot {
  return {
    id: `reaction-${emoji}-${userId}`,
    programId: "program-g028",
    messageId: "message-question",
    userId,
    emoji,
    createdAt: "2026-08-31T10:00:00.000Z",
    updatedAt: "2026-08-31T10:00:00.000Z",
    user: {
      id: userId,
      name,
      imageUrl: null,
      seasons: ["3기"],
    },
  };
}

describe("Program TALK message reaction domain", () => {
  it("never exposes reaction controls for a soft-hidden message", () => {
    const message: ProgramMessage = {
      id: "message-hidden",
      programId: "program-g028",
      authorId: "member-one",
      type: "CHAT",
      content: "운영진 검토로 숨긴 메시지",
      parentId: null,
      isPinned: false,
      isHidden: true,
      createdAt: "2026-08-31T10:00:00.000Z",
      editedAt: null,
    };

    expect(
      canReactToProgramMessage({ canReactToMessage: true }, message),
    ).toBe(false);
    expect(
      canReactToProgramMessage(
        { canReactToMessage: true },
        { ...message, isHidden: false },
      ),
    ).toBe(true);
  });

  it("keeps the MVP allowlist exact, ordered, labelled, and closed to other emoji", () => {
    expect(MESSAGE_REACTION_EMOJIS).toEqual(["👍", "❤️", "😂", "😮", "👏", "✅"]);
    expect(Object.keys(MESSAGE_REACTION_LABELS)).toEqual(MESSAGE_REACTION_EMOJIS);
    expect(MESSAGE_REACTION_LABELS).toEqual({
      "👍": "공감",
      "❤️": "마음",
      "😂": "웃음",
      "😮": "놀람",
      "👏": "박수",
      "✅": "확인",
    });

    for (const emoji of MESSAGE_REACTION_EMOJIS) {
      expect(isMessageReactionEmoji(emoji)).toBe(true);
    }
    for (const unsupported of ["😍", "🔥", "👍🏻", "", null, undefined, 1]) {
      expect(isMessageReactionEmoji(unsupported)).toBe(false);
    }
  });

  it("groups only populated reactions in allowlist order with counts, users, and viewer state", () => {
    const reactions = [
      reaction("✅", "member-check", "체크 멤버"),
      reaction("👍", "member-other", "다른 멤버"),
      reaction("😮", "member-wow", "놀란 멤버"),
      reaction("👍", "member-current", "현재 멤버"),
      reaction("❤️", "member-heart", "마음 멤버"),
    ];

    const groups = groupMessageReactions(reactions, "member-current");

    expect(groups.map((group) => group.emoji)).toEqual(["👍", "❤️", "😮", "✅"]);
    expect(groups).toEqual([
      {
        emoji: "👍",
        count: 2,
        reactedByCurrentUser: true,
        users: [reactions[1].user, reactions[3].user],
      },
      {
        emoji: "❤️",
        count: 1,
        reactedByCurrentUser: false,
        users: [reactions[4].user],
      },
      {
        emoji: "😮",
        count: 1,
        reactedByCurrentUser: false,
        users: [reactions[2].user],
      },
      {
        emoji: "✅",
        count: 1,
        reactedByCurrentUser: false,
        users: [reactions[0].user],
      },
    ]);
  });

  it("does not mark any aggregate as the viewer's reaction without a viewer", () => {
    const groups = groupMessageReactions(
      [reaction("👏", "member-one", "첫 멤버")],
      null,
    );

    expect(groups).toEqual([
      expect.objectContaining({
        emoji: "👏",
        count: 1,
        reactedByCurrentUser: false,
      }),
    ]);
  });
});
