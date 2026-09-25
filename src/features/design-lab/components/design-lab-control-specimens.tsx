"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

export function DesignLabControlSpecimens() {
  const [lastAction, setLastAction] = useState("버튼을 눌러 상호작용 상태를 확인하세요.");

  return (
    <>
      <div className="oa-design-lab-actions">
        <Button onClick={() => setLastAction("PRIMARY 버튼을 실행했습니다.")}>PRIMARY →</Button>
        <Button variant="outline" onClick={() => setLastAction("SECONDARY 버튼을 실행했습니다.")}>SECONDARY</Button>
        <Button variant="text" onClick={() => setLastAction("TEXT ACTION을 실행했습니다.")}>TEXT ACTION</Button>
      </div>
      <p className="oa-meta oa-muted" role="status" aria-live="polite">
        {lastAction}
      </p>
    </>
  );
}
