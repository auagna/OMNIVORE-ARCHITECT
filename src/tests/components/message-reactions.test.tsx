import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useCallback, useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  MessageReactionBar,
  MessageReactionChip,
  MessageReactionPicker,
} from "@/features/conversation/reactions/components";
import type {
  MessageReactionEmoji,
  MessageReactionGroup,
  MessageReactionSnapshot,
  MessageReactionUser,
} from "@/features/conversation/reactions";

const currentUser: MessageReactionUser = {
  id: "member-current",
  name: "현재 멤버",
  imageUrl: null,
  seasons: ["3기"],
};

const otherUser: MessageReactionUser = {
  id: "member-other",
  name: "다른 멤버",
  imageUrl: null,
  seasons: ["2기"],
};

function reaction(
  emoji: MessageReactionEmoji,
  user: MessageReactionUser,
): MessageReactionSnapshot {
  return {
    id: `reaction-${emoji}-${user.id}`,
    programId: "program-g028",
    messageId: "message-question",
    userId: user.id,
    emoji,
    createdAt: "2026-08-31T10:00:00.000Z",
    updatedAt: "2026-08-31T10:00:00.000Z",
    user,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

interface ReactionHarnessProps {
  initialReactions: MessageReactionSnapshot[];
  onToggle: (
    messageId: string,
    emoji: MessageReactionEmoji,
  ) => Promise<MessageReactionSnapshot | null>;
  onError?: (message: string | null) => void;
}

function ReactionHarness({
  initialReactions,
  onToggle,
  onError = () => undefined,
}: ReactionHarnessProps) {
  const [reactions, setReactions] = useState(initialReactions);
  const [pickerOpen, setPickerOpen] = useState(false);
  const settle = useCallback((
    _messageId: string,
    userId: string,
    nextReaction: MessageReactionSnapshot | null,
  ) => {
    setReactions((current) => [
      ...current.filter((item) => item.userId !== userId),
      ...(nextReaction ? [nextReaction] : []),
    ]);
  }, []);

  return (
    <MessageReactionBar
      messageId="message-question"
      authorName="질문 작성자"
      currentUser={currentUser}
      reactions={reactions}
      canReact
      pickerOpen={pickerOpen}
      onPickerOpenChange={setPickerOpen}
      onToggle={onToggle}
      onSettled={settle}
      onError={onError}
    />
  );
}

function PickerHarness({
  selectedEmoji = null,
  onSelect,
  onClose,
}: {
  selectedEmoji?: MessageReactionEmoji | null;
  onSelect: (emoji: MessageReactionEmoji) => void;
  onClose: (restoreFocus: boolean) => void;
}) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={anchorRef} type="button">REACTION TRIGGER</button>
      <MessageReactionPicker
        open
        selectedEmoji={selectedEmoji}
        anchorRef={anchorRef}
        onSelect={onSelect}
        onClose={onClose}
      />
    </>
  );
}

describe("Message reactions", () => {
  it("gives active, inactive, and read-only chips explicit accessible state", () => {
    const activeGroup: MessageReactionGroup = {
      emoji: "👍",
      count: 2,
      reactedByCurrentUser: true,
      users: [currentUser, otherUser],
    };
    const { rerender } = render(
      <MessageReactionChip group={activeGroup} canReact onToggle={vi.fn()} />,
    );

    expect(
      screen.getByRole("button", { name: "내 공감 반응 제거, 현재 2명" }),
    ).toHaveAttribute("aria-pressed", "true");

    rerender(
      <MessageReactionChip
        group={{ ...activeGroup, reactedByCurrentUser: false }}
        canReact
        onToggle={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "공감 반응 추가, 현재 2명" }),
    ).toHaveAttribute("aria-pressed", "false");

    rerender(
      <MessageReactionChip
        group={{ ...activeGroup, reactedByCurrentUser: false }}
        canReact={false}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("공감 반응 2개")).not.toHaveAttribute("role", "button");
  });

  it("exposes the six picker choices and supports Arrow, Home, End, Escape, and selection", async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<PickerHarness onSelect={onSelect} onClose={onClose} />);

    const picker = screen.getByRole("toolbar", { name: "메시지 반응 선택" });
    const choices = within(picker).getAllByRole("button");
    expect(choices).toHaveLength(6);
    expect(choices.map((choice) => choice.getAttribute("aria-label"))).toEqual([
      "공감 반응",
      "마음 반응",
      "웃음 반응",
      "놀람 반응",
      "박수 반응",
      "확인 반응",
    ]);

    await waitFor(() => expect(choices[0]).toHaveFocus());
    fireEvent.keyDown(picker, { key: "ArrowRight" });
    expect(choices[1]).toHaveFocus();
    fireEvent.keyDown(picker, { key: "End" });
    expect(choices[5]).toHaveFocus();
    fireEvent.keyDown(picker, { key: "Home" });
    expect(choices[0]).toHaveFocus();
    fireEvent.keyDown(picker, { key: "ArrowLeft" });
    expect(choices[5]).toHaveFocus();

    fireEvent.click(choices[5]);
    expect(onSelect).toHaveBeenCalledWith("✅");

    fireEvent.keyDown(picker, { key: "Escape" });
    expect(onClose).toHaveBeenCalledWith(true);
  });

  it("marks the selected picker choice without changing the six-choice order", () => {
    render(
      <PickerHarness selectedEmoji="😂" onSelect={vi.fn()} onClose={vi.fn()} />,
    );

    const picker = screen.getByRole("toolbar", { name: "메시지 반응 선택" });
    const selected = within(picker).getByRole("button", {
      name: "웃음 반응 선택됨",
    });
    expect(selected).toHaveAttribute("aria-pressed", "true");
    expect(within(picker).getAllByRole("button")).toHaveLength(6);
  });

  it("updates optimistically and keeps the settled reaction after success", async () => {
    const request = deferred<MessageReactionSnapshot | null>();
    const onToggle = vi.fn(() => request.promise);
    const user = userEvent.setup();
    render(
      <ReactionHarness
        initialReactions={[reaction("👍", otherUser)]}
        onToggle={onToggle}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "공감 반응 추가, 현재 1명" }),
    );
    expect(
      screen.getByRole("button", { name: "내 공감 반응 제거, 현재 2명" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(onToggle).toHaveBeenCalledWith("message-question", "👍");

    await act(async () => {
      request.resolve(reaction("👍", currentUser));
      await request.promise;
    });
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "내 공감 반응 제거, 현재 2명" }),
      ).toBeVisible();
    });
  });

  it("rolls the optimistic state back and reports a mutation failure", async () => {
    const request = deferred<MessageReactionSnapshot | null>();
    const onError = vi.fn();
    const user = userEvent.setup();
    render(
      <ReactionHarness
        initialReactions={[reaction("👍", otherUser)]}
        onToggle={() => request.promise}
        onError={onError}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "공감 반응 추가, 현재 1명" }),
    );
    expect(
      screen.getByRole("button", { name: "내 공감 반응 제거, 현재 2명" }),
    ).toBeVisible();

    await act(async () => {
      request.reject(new Error("반응 저장 실패"));
      await request.promise.catch(() => undefined);
    });
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "공감 반응 추가, 현재 1명" }),
      ).toHaveAttribute("aria-pressed", "false");
    });
    expect(onError).toHaveBeenCalledWith("반응 저장 실패");
  });

  it("serializes rapid toggles so the latest desired state wins", async () => {
    const first = deferred<MessageReactionSnapshot | null>();
    const second = deferred<MessageReactionSnapshot | null>();
    const onToggle = vi
      .fn<ReactionHarnessProps["onToggle"]>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const user = userEvent.setup();
    render(
      <ReactionHarness
        initialReactions={[reaction("👍", otherUser)]}
        onToggle={onToggle}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "공감 반응 추가, 현재 1명" }),
    );
    await user.click(
      screen.getByRole("button", { name: "내 공감 반응 제거, 현재 2명" }),
    );
    expect(
      screen.getByRole("button", { name: "공감 반응 추가, 현재 1명" }),
    ).toBeVisible();
    expect(onToggle).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve(reaction("👍", currentUser));
      await first.promise;
    });
    await waitFor(() => expect(onToggle).toHaveBeenCalledTimes(2));
    expect(onToggle).toHaveBeenNthCalledWith(2, "message-question", "👍");

    await act(async () => {
      second.resolve(null);
      await second.promise;
    });
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "공감 반응 추가, 현재 1명" }),
      ).toHaveAttribute("aria-pressed", "false");
    });
  });
});
