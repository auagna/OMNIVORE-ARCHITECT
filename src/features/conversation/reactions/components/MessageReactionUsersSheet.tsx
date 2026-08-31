"use client";

import { useEffect, useId, useRef, type RefObject } from "react";
import { MESSAGE_REACTION_LABELS } from "../../constants/message-reactions";
import type { MessageReactionGroup } from "../types/message-reaction";

interface MessageReactionUsersSheetProps {
  open: boolean;
  groups: readonly MessageReactionGroup[];
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onOpenChange: (open: boolean) => void;
}

export function MessageReactionUsersSheet({
  open,
  groups,
  returnFocusRef,
  onOpenChange,
}: MessageReactionUsersSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function close() {
    onOpenChange(false);
    window.setTimeout(() => returnFocusRef.current?.focus(), 0);
  }

  return (
    <dialog
      ref={dialogRef}
      className="oa-reaction-users"
      aria-labelledby={headingId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      onClose={() => {
        if (open) onOpenChange(false);
      }}
    >
      <header className="oa-reaction-users__header">
        <div>
          <p className="oa-overline">MESSAGE</p>
          <h2 id={headingId}>REACTIONS</h2>
        </div>
        <button type="button" onClick={close} aria-label="반응한 사람 목록 닫기">
          CLOSE
        </button>
      </header>
      <div className="oa-reaction-users__groups">
        {groups.map((group, index) => {
          const groupHeadingId = `${headingId}-group-${index}`;
          return (
            <section key={group.emoji} aria-labelledby={groupHeadingId}>
              <h3 id={groupHeadingId}>
                <span aria-hidden="true">{group.emoji}</span>{" "}
                {MESSAGE_REACTION_LABELS[group.emoji]} / {group.count}
              </h3>
              <ul>
                {group.users.map((user) => (
                  <li key={user.id}>
                    <span>{user.name}</span>
                    <span>{user.seasons.length ? user.seasons.join(" · ") : "MEMBER"}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </dialog>
  );
}
