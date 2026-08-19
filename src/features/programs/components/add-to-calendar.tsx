"use client";

import { useState } from "react";
import { buildGoogleCalendarUrl, buildIcs, calendarFileName } from "@/lib/calendar-export";
import type { Program } from "@/types";

type CalendarAction = "APPLE" | "GOOGLE" | "ICS";

function currentProgramUrl(programId: string): string {
  return new URL(`/program/${programId}`, window.location.origin).toString();
}

function downloadIcs(program: Program) {
  const blob = new Blob([buildIcs(program, currentProgramUrl(program.id))], { type: "text/calendar;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = calendarFileName(program);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 0);
}

export function AddToCalendar({ program }: { program: Program }) {
  const [exportFailure, setExportFailure] = useState<{ action: CalendarAction; message: string } | null>(null);

  function run(action: CalendarAction) {
    setExportFailure(null);
    try {
      if (action === "GOOGLE") {
        const href = buildGoogleCalendarUrl(program, currentProgramUrl(program.id));
        const opened = window.open(href, "_blank", "noopener,noreferrer");
        if (opened) opened.opener = null;
        return;
      }
      downloadIcs(program);
    } catch (reason) {
      setExportFailure({
        action,
        message: reason instanceof Error
          ? reason.message
          : "Calendar 파일을 만들지 못했습니다.",
      });
    }
  }

  return (
    <details className="oa-calendar-export">
      <summary>ADD TO CALENDAR</summary>
      <div className="oa-calendar-export__options">
        <button type="button" onClick={() => run("APPLE")}>APPLE CALENDAR <span aria-hidden="true">→</span></button>
        <button type="button" onClick={() => run("GOOGLE")}>GOOGLE CALENDAR <span aria-hidden="true">↗</span></button>
        <button type="button" onClick={() => run("ICS")}>DOWNLOAD .ICS <span aria-hidden="true">↓</span></button>
      </div>
      {exportFailure ? (
        <div className="oa-flash" role="alert">
          <strong>CALENDAR EXPORT FAILED</strong>
          <br />
          {exportFailure.message}
          <br />
          <button type="button" onClick={() => run(exportFailure.action)}>RETRY →</button>
        </div>
      ) : null}
    </details>
  );
}
