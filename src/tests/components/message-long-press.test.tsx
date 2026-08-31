import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMessageLongPress } from "@/features/conversation/reactions";

function LongPressHarness({
  enabled = true,
  onLongPress,
}: {
  enabled?: boolean;
  onLongPress: () => void;
}) {
  const handlers = useMessageLongPress({ enabled, onLongPress });
  return (
    <article data-testid="message" {...handlers}>
      <p>길게 누를 메시지</p>
      <button type="button">REPLY</button>
    </article>
  );
}

function pointerDown(target: Element, overrides: Record<string, unknown> = {}) {
  fireEvent.pointerDown(target, {
    pointerType: "touch",
    button: 0,
    clientX: 20,
    clientY: 30,
    ...overrides,
  });
}

describe("useMessageLongPress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("fires at 400ms, not before, and suppresses the resulting touch context menu", () => {
    const onLongPress = vi.fn();
    render(<LongPressHarness onLongPress={onLongPress} />);
    const message = screen.getByTestId("message");

    pointerDown(message);
    act(() => vi.advanceTimersByTime(399));
    expect(onLongPress).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(onLongPress).toHaveBeenCalledOnce();
    expect(fireEvent.contextMenu(message)).toBe(false);
  });

  it("cancels when movement exceeds ten pixels before the delay", () => {
    const onLongPress = vi.fn();
    render(<LongPressHarness onLongPress={onLongPress} />);
    const message = screen.getByTestId("message");

    pointerDown(message);
    fireEvent.pointerMove(message, {
      pointerType: "touch",
      clientX: 31,
      clientY: 30,
    });
    act(() => vi.advanceTimersByTime(400));

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("keeps exactly ten pixels within tolerance", () => {
    const onLongPress = vi.fn();
    render(<LongPressHarness onLongPress={onLongPress} />);
    const message = screen.getByTestId("message");

    pointerDown(message);
    fireEvent.pointerMove(message, {
      pointerType: "touch",
      clientX: 30,
      clientY: 30,
    });
    act(() => vi.advanceTimersByTime(400));

    expect(onLongPress).toHaveBeenCalledOnce();
  });

  it("ignores mouse pointers, disabled gestures, and interactive descendants", () => {
    const onLongPress = vi.fn();
    const { rerender } = render(<LongPressHarness onLongPress={onLongPress} />);
    const message = screen.getByTestId("message");

    pointerDown(message, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(400));
    expect(onLongPress).not.toHaveBeenCalled();

    pointerDown(screen.getByRole("button", { name: "REPLY" }));
    act(() => vi.advanceTimersByTime(400));
    expect(onLongPress).not.toHaveBeenCalled();

    rerender(<LongPressHarness enabled={false} onLongPress={onLongPress} />);
    pointerDown(screen.getByTestId("message"));
    act(() => vi.advanceTimersByTime(400));
    expect(onLongPress).not.toHaveBeenCalled();
  });
});
