"use client";

import {
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

const LONG_PRESS_DELAY_MS = 400;
const LONG_PRESS_MOVEMENT_PX = 10;

interface MessageLongPressOptions {
  enabled: boolean;
  onLongPress: () => void;
}

export function useMessageLongPress({
  enabled,
  onLongPress,
}: MessageLongPressOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef({ x: 0, y: 0 });
  const firedRef = useRef(false);
  const touchStartedAtRef = useRef(0);

  function cancel() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  useEffect(() => cancel, []);

  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (!enabled || event.pointerType === "mouse" || event.button !== 0) return;
    if ((event.target as Element).closest("button, a, input, select, textarea")) return;
    cancel();
    firedRef.current = false;
    touchStartedAtRef.current = Date.now();
    startRef.current = { x: event.clientX, y: event.clientY };
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      timerRef.current = null;
      window.getSelection()?.removeAllRanges();
      onLongPress();
    }, LONG_PRESS_DELAY_MS);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (!timerRef.current) return;
    const distance = Math.hypot(
      event.clientX - startRef.current.x,
      event.clientY - startRef.current.y,
    );
    if (distance > LONG_PRESS_MOVEMENT_PX) cancel();
  }

  function onContextMenu(event: ReactMouseEvent<HTMLElement>) {
    const recentTouch = Date.now() - touchStartedAtRef.current < 900;
    if (enabled && recentTouch && firedRef.current) event.preventDefault();
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onContextMenu,
  };
}
