"use client";

import { useSearchParams } from "next/navigation";
import { AdminApprovalQueue, AdminApprovalReview } from "./admin-approvals";
import { AdminContentEditor, isPageContentKey } from "./admin-content";
import { AdminOverview } from "./admin-overview";
import { AdminShell, isAdminView, type AdminView } from "./admin-shell";
import { AdminPageHeader, AdminState } from "./admin-ui";

const TASK_STATES: Record<Exclude<AdminView, "overview" | "approvals" | "content">, { title: string; description: string }> = {
  programs: {
    title: "PROGRAM OPERATIONS",
    description: "Program 상태 변경과 편집은 각 Program의 Hosting 화면에서 진행합니다.",
  },
  members: {
    title: "MEMBER APPROVAL",
    description: "현재 배포에는 Member 승인 데이터 adapter가 연결되어 있지 않습니다.",
  },
  seasons: {
    title: "SEASON MANAGEMENT",
    description: "현재 배포에는 Season 관리 데이터 adapter가 연결되어 있지 않습니다.",
  },
  records: {
    title: "RECORD STATUS",
    description: "Record Required는 Home, My와 각 Program Detail에서 확인합니다.",
  },
  conversations: {
    title: "CONVERSATION MODERATION",
    description: "운영 대화는 각 Program에 종속된 TALK에서 확인합니다.",
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
  } else {
    content = <AdminTaskPlaceholder view={activeView} />;
  }

  return <AdminShell activeView={activeView}>{content}</AdminShell>;
}
