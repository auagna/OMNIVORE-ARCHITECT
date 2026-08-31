"use client";

import {
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  MESSAGE_REACTION_EMOJIS,
  MESSAGE_REACTION_LABELS,
  type MessageReactionEmoji,
} from "../../constants/message-reactions";

interface MessageReactionPickerProps {
  open: boolean;
  selectedEmoji: MessageReactionEmoji | null;
  anchorRef: RefObject<HTMLButtonElement | null>;
  onSelect: (emoji: MessageReactionEmoji) => void;
  onClose: (restoreFocus: boolean) => void;
}

export function MessageReactionPicker({
  open,
  selectedEmoji,
  anchorRef,
  onSelect,
  onClose,
}: MessageReactionPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    const selectedIndex = selectedEmoji
      ? MESSAGE_REACTION_EMOJIS.indexOf(selectedEmoji)
      : 0;
    const focusTimer = window.setTimeout(() => {
      pickerRef.current
        ?.querySelector<HTMLButtonElement>(`[data-index="${Math.max(0, selectedIndex)}"]`)
        ?.focus();
    }, 0);
    return () => window.clearTimeout(focusTimer);
  }, [anchorRef, open, selectedEmoji]);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target as Node;
      if (
        pickerRef.current?.contains(target) ||
        anchorRef.current?.contains(target)
      ) return;
      onClose(false);
    }
    function closeOnViewportChange() {
      onClose(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [anchorRef, onClose, open]);

  function moveFocus(nextIndex: number) {
    const normalized =
      (nextIndex + MESSAGE_REACTION_EMOJIS.length) %
      MESSAGE_REACTION_EMOJIS.length;
    setActiveIndex(normalized);
    pickerRef.current
      ?.querySelector<HTMLButtonElement>(`[data-index="${normalized}"]`)
      ?.focus();
  }

  return (
    <div
      ref={pickerRef}
      className="oa-reaction-picker"
      role="toolbar"
      aria-label="메시지 반응 선택"
      aria-hidden={!open}
      inert={!open}
      data-state={open ? "open" : "closed"}
      onKeyDown={(event) => {
        if (!open) return;
        if (event.key === "ArrowRight") {
          event.preventDefault();
          moveFocus(activeIndex + 1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          moveFocus(activeIndex - 1);
        } else if (event.key === "Home") {
          event.preventDefault();
          moveFocus(0);
        } else if (event.key === "End") {
          event.preventDefault();
          moveFocus(MESSAGE_REACTION_EMOJIS.length - 1);
        } else if (event.key === "Escape") {
          event.preventDefault();
          onClose(true);
        }
      }}
    >
      {MESSAGE_REACTION_EMOJIS.map((emoji, index) => (
        <button
          key={emoji}
          type="button"
          data-index={index}
          tabIndex={open && index === activeIndex ? 0 : -1}
          aria-label={`${MESSAGE_REACTION_LABELS[emoji]} 반응${selectedEmoji === emoji ? " 선택됨" : ""}`}
          aria-pressed={selectedEmoji === emoji}
          onFocus={() => setActiveIndex(index)}
          onClick={() => onSelect(emoji)}
        >
          <span aria-hidden="true">{emoji}</span>
        </button>
      ))}
    </div>
  );
}
