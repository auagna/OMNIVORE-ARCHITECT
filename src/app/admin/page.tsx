"use client";

import { useSearchParams } from "next/navigation";
import { AdminApprovalQueue, AdminApprovalReview } from "./admin-approvals";
import { AdminConversations } from "./admin-conversations";
import { AdminContentEditor, isPageContentKey } from "./admin-content";
import { AdminMembers } from "./admin-members";
import { AdminOverview } from "./admin-overview";
import { AdminPrograms } from "./admin-programs";
import { AdminRecords } from "./admin-records";
import { AdminShell, isAdminView, type AdminView } from "./admin-shell";
import { AdminPageHeader, AdminState } from "./admin-ui";

const TASK_STATES: Record<"seasons", { title: string; description: string }> = {
  seasons: {
    title: "SEASON MANAGEMENT",
    description: "Season 전환은 Admin-only 원자적 adapter를 연결하는 다음 작업입니다.",
  },
};

function AdminTaskPlaceholder({ view }: { view: keyof typeof TASK_STATES }) {
  const state = TASK_STATES[view];
  return (
    <main className="oa-admin-page">
      <AdminPageHeader eyebrow={`OA / ADMIN / ${view.toUpperCase()}`} title={view.toUpperCase()} />
      <AdminState label="TASK STATE" title={state.title} description={state.description} />
    </main>
  );
}

export default function AdminPage() {
  const searchParams = useSearchParams();
  const viewParam = searchParams.get("view");
  const activeView: AdminView = isAdminView(viewParam) ? viewParam : "overview";
  const programId = searchParams.get("program");
  const contentKeyParam = searchParams.get("key");
  const contentKey = isPageContentKey(contentKeyParam) ? contentKeyParam : "home";

  let content: React.ReactNode;
  if (activeView === "overview") {
    content = <AdminOverview />;
  } else if (activeView === "approvals") {
    content = programId ? <AdminApprovalReview programId={programId} /> : <AdminApprovalQueue />;
  } else if (activeView === "content") {
    content = <AdminContentEditor selectedKey={contentKey} />;
  } else if (activeView === "programs") {
    content = <AdminPrograms />;
  } else if (activeView === "members") {
    content = <AdminMembers />;
  } else if (activeView === "records") {
    content = <AdminRecords />;
  } else if (activeView === "conversations") {
    content = <AdminConversations />;
  } else {
    content = <AdminTaskPlaceholder view={activeView} />;
  }

  return <AdminShell activeView={activeView}>{content}</AdminShell>;
}
