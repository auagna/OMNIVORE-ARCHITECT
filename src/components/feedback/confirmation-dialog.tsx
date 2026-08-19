"use client";

import { useEffect, useId, useRef } from "react";

export interface ConfirmationDialogProps {
  open: boolean;
  eyebrow: string;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmationDialog({
  open,
  eyebrow,
  title,
  description,
  confirmLabel,
  cancelLabel = "CANCEL",
  danger = false,
  pending = false,
  onCancel,
  onConfirm,
}: ConfirmationDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      cancelButtonRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="oa-confirmation-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onCancel();
      }}
      onClose={() => {
        if (open && !pending) onCancel();
      }}
    >
      <p className="oa-overline">{eyebrow}</p>
      <h2 id={titleId}>{title}</h2>
      <p id={descriptionId}>{description}</p>
      <div className="oa-form-actions">
        <button ref={cancelButtonRef} className="oa-secondary-button" type="button" onClick={onCancel} disabled={pending}>
          {cancelLabel}
        </button>
        <button className={danger ? "oa-danger-button" : "oa-primary-button"} type="button" onClick={onConfirm} disabled={pending}>
          {pending ? "WORKING…" : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
