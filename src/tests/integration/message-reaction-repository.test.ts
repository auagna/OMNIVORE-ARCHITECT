import { describe, expect, it, vi } from "vitest";

import { MOCK_CURRENT_USER_ID } from "@/constants";
import type { MessageReactionEmoji } from "@/features/conversation/reactions";
import { createMockRepositoryState, MOCK_PROGRAM_IDS } from "@/lib/repositories/mock-data";
import { BrowserMockRepository } from "@/lib/repositories/mock-repository";

const PROGRAM_ID = MOCK_PROGRAM_IDS.exhibition;
const MESSAGE_ID = "message-exhibition-chat";
const HOST_ID = "user-host-exhibition";
const now = "2026-08-09T10:00:00+09:00";

function repository(
  state = createMockRepositoryState(),
): BrowserMockRepository {
  return new BrowserMockRepository({
    storageKey: `oa:reaction-test:${crypto.randomUUID()}`,
    initialState: state,
  });
}

describe("BrowserMockRepository message reactions", () => {
  it("creates, changes, and removes one reaction per user and message", async () => {
    const repo = repository();

    const created = await repo.toggleProgramMessageReaction(
      PROGRAM_ID,
      MESSAGE_ID,
      "❤️",
      HOST_ID,
      now,
    );
    expect(created).toMatchObject({
      messageId: MESSAGE_ID,
      userId: HOST_ID,
      emoji: "❤️",
    });

    const changed = await repo.toggleProgramMessageReaction(
      PROGRAM_ID,
      MESSAGE_ID,
      "👍",
      HOST_ID,
      now,
    );
    expect(changed).toMatchObject({ emoji: "👍" });
    await expect(
      repo.listProgramMessageReactions(PROGRAM_ID, HOST_ID, [MESSAGE_ID]),
    ).resolves.toMatchObject([{ userId: HOST_ID, emoji: "👍" }]);

    await expect(
      repo.toggleProgramMessageReaction(
        PROGRAM_ID,
        MESSAGE_ID,
        "👍",
        HOST_ID,
        now,
      ),
    ).resolves.toBeNull();
    await expect(
      repo.listProgramMessageReactions(PROGRAM_ID, HOST_ID, [MESSAGE_ID]),
    ).resolves.toEqual([]);
  });

  it("emits a message-scoped invalidation for each mutation", async () => {
    const repo = repository();
    const listener = vi.fn();
    const stop = repo.watchProgramMessages(PROGRAM_ID, listener);

    await repo.toggleProgramMessageReaction(
      PROGRAM_ID,
      MESSAGE_ID,
      "✅",
      HOST_ID,
      now,
    );
    await repo.toggleProgramMessageReaction(
      PROGRAM_ID,
      MESSAGE_ID,
      "✅",
      HOST_ID,
      now,
    );

    expect(listener).toHaveBeenNthCalledWith(1, MESSAGE_ID);
    expect(listener).toHaveBeenNthCalledWith(2, MESSAGE_ID);
    stop();
  });

  it.each(["APPLIED", "WAITLIST", "CANCELLED"] as const)(
    "denies mutation for a %s participant",
    async (status) => {
      const state = createMockRepositoryState();
      state.participations.push({
        id: `participation-reaction-${status.toLowerCase()}`,
        programId: PROGRAM_ID,
        userId: MOCK_CURRENT_USER_ID,
        status,
        paymentStatus: "NOT_REQUIRED",
        joinedAt: now,
      });
      const repo = repository(state);

      await expect(
        repo.toggleProgramMessageReaction(
          PROGRAM_ID,
          MESSAGE_ID,
          "👏",
          MOCK_CURRENT_USER_ID,
          now,
        ),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    },
  );

  it("lets a cancelled participant read existing reactions but not change them", async () => {
    const state = createMockRepositoryState();
    state.participations.push({
      id: "participation-reaction-cancelled-read",
      programId: PROGRAM_ID,
      userId: MOCK_CURRENT_USER_ID,
      status: "CANCELLED",
      paymentStatus: "NOT_REQUIRED",
      joinedAt: now,
    });
    const repo = repository(state);

    await expect(
      repo.listProgramMessageReactions(PROGRAM_ID, MOCK_CURRENT_USER_ID),
    ).resolves.not.toHaveLength(0);
    await expect(
      repo.toggleProgramMessageReaction(
        PROGRAM_ID,
        MESSAGE_ID,
        "😂",
        MOCK_CURRENT_USER_ID,
        now,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects non-members, arbitrary emoji, and cross-Program message ids", async () => {
    const repo = repository();

    await expect(
      repo.listProgramMessageReactions(PROGRAM_ID, MOCK_CURRENT_USER_ID),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      repo.toggleProgramMessageReaction(
        PROGRAM_ID,
        MESSAGE_ID,
        "🔥" as MessageReactionEmoji,
        HOST_ID,
        now,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      repo.toggleProgramMessageReaction(
        PROGRAM_ID,
        "message-reading-chat",
        "👍",
        HOST_ID,
        now,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      repo.toggleProgramMessageReaction(
        PROGRAM_ID,
        MESSAGE_ID,
        "👍",
        "missing-user",
        now,
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("keeps reactions readable but immutable when the Program is cancelled", async () => {
    const state = createMockRepositoryState();
    const program = state.programs.find((item) => item.id === PROGRAM_ID);
    if (!program) throw new Error("fixture Program missing");
    program.status = "CANCELLED";
    const repo = repository(state);

    await expect(
      repo.listProgramMessageReactions(PROGRAM_ID, HOST_ID),
    ).resolves.not.toHaveLength(0);
    await expect(
      repo.toggleProgramMessageReaction(
        PROGRAM_ID,
        MESSAGE_ID,
        "😮",
        HOST_ID,
        now,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("omits hidden messages and their reactions and rejects a direct toggle", async () => {
    const state = createMockRepositoryState();
    const hiddenMessageId = "message-exhibition-question";
    const message = state.messages.find((item) => item.id === hiddenMessageId);
    if (!message) throw new Error("fixture ProgramMessage missing");
    message.isHidden = true;
    const repo = repository(state);

    await expect(
      repo.listProgramMessages(PROGRAM_ID, HOST_ID),
    ).resolves.not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: hiddenMessageId })]),
    );
    await expect(
      repo.listProgramMessageReactions(PROGRAM_ID, HOST_ID, [hiddenMessageId]),
    ).resolves.toEqual([]);
    await expect(
      repo.toggleProgramMessageReaction(
        PROGRAM_ID,
        hiddenMessageId,
        "❤️",
        HOST_ID,
        now,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
