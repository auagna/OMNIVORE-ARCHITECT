"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { OAMiniLogo } from "@/components/oa-mini-logo";
import { useAppState, useRepositoryQuery } from "@/features/app-state/app-state-provider";
import type { OARepository } from "@/lib/repositories";

export type AdminView =
  | "overview"
  | "approvals"
  | "programs"
  | "members"
  | "seasons"
  | "records"
  | "conversations"
  | "content";

const ADMIN_NAVIGATION: ReadonlyArray<{ label: string; view: AdminView }> = [
  { label: "OVERVIEW", view: "overview" },
  { label: "APPROVALS", view: "approvals" },
  { label: "PROGRAMS", view: "programs" },
  { label: "MEMBERS", view: "members" },
  { label: "SEASONS", view: "seasons" },
  { label: "RECORDS", view: "records" },
  { label: "CONVERSATIONS", view: "conversations" },
  { label: "CONTENT", view: "content" },
];

export function isAdminView(value: string | null): value is AdminView {
  return ADMIN_NAVIGATION.some((item) => item.view === value);
}

function AdminAccessGate({ children }: { children: React.ReactNode }) {
  const { currentUserId, sessionLoading } = useAppState();
  const query = useCallback(
    (repository: OARepository) =>
      currentUserId ? repository.getUserById(currentUserId) : Promise.resolve(null),
    [currentUserId],
  );
  const { data: user, loading, error, reload } = useRepositoryQuery(query, [currentUserId]);

  if (sessionLoading || loading) {
    return (
      <main className="oa-admin-gate" aria-live="polite" aria-busy="true">
        <p className="oa-admin-kicker">OA / ADMIN</p>
        <h1>CHECKING<br />ACCESS</h1>
        <p>관리자 권한을 확인하고 있습니다.</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="oa-admin-gate" aria-labelledby="admin-access-error" role="alert">
        <p className="oa-admin-kicker">OA / ADMIN</p>
        <h1 id="admin-access-error">DATA<br />ERROR</h1>
        <p>{error.message}</p>
        <button className="oa-admin-text-action" type="button" onClick={reload}>RETRY →</button>
      </main>
    );
  }

  if (!user || user.status !== "ADMIN") {
    return (
      <main className="oa-admin-gate" aria-labelledby="admin-access-title">
        <p className="oa-admin-kicker">OA / ADMIN</p>
        <h1 id="admin-access-title">ADMIN<br />ONLY</h1>
        <p>관리자 계정으로 로그인해야 이 업무 화면에 접근할 수 있습니다.</p>
        <Link className="oa-admin-text-action" href="/login">ADMIN LOGIN →</Link>
      </main>
    );
  }

  return children;
}

function adminHref(view: AdminView): string {
  return view === "overview" ? "/admin" : `/admin?view=${view}`;
}

export function AdminShell({ children, activeView }: { children: React.ReactNode; activeView: AdminView }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signOut } = useAppState();

  async function logout() {
    await signOut();
    router.push("/login");
  }

  return (
    <AdminAccessGate>
      <div className="oa-admin-shell">
        <a className="oa-skip-link" href="#admin-main">SKIP TO CONTENT</a>
        <aside className="oa-admin-sidebar">
          <Link className="oa-admin-brand" href="/" aria-label="OMNIVORE ARCHITECT home">
            <OAMiniLogo className="oa-admin-mark" />
            <span>OA / ADMIN</span>
          </Link>
          <nav className="oa-admin-nav" aria-label="Admin navigation">
            {ADMIN_NAVIGATION.map(({ label, view }, index) => (
              <Link href={adminHref(view)} key={view} aria-current={activeView === view ? "page" : undefined}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {label}
              </Link>
            ))}
          </nav>
          <div className="oa-admin-session">
            <Link href="/">VIEW SITE →</Link>
            <button type="button" onClick={() => void logout()}>LOGOUT</button>
          </div>
        </aside>

        <header className="oa-admin-mobile-head">
          <Link href="/admin"><OAMiniLogo className="oa-admin-mark" /> OA / ADMIN</Link>
          <Link href="/">SITE →</Link>
        </header>
        <div className="oa-admin-mobile-nav-wrap">
          <nav className="oa-admin-mobile-nav" aria-label="Admin navigation">
            {ADMIN_NAVIGATION.map(({ label, view }) => (
              <Link href={adminHref(view)} key={view} aria-current={activeView === view ? "page" : undefined}>{label}</Link>
            ))}
          </nav>
        </div>

        <div className="oa-admin-main" id="admin-main" tabIndex={-1} key={searchParams.toString()}>{children}</div>
      </div>
    </AdminAccessGate>
  );
}
