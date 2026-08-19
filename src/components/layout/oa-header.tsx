"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { OAMiniLogo } from "@/components/oa-mini-logo";
import { useAppState, useRepositoryQuery } from "@/features/app-state/app-state-provider";
import type { OARepository } from "@/lib/repositories";

export interface OAHeaderProps {
  contextLabel?: string;
  isAdmin?: boolean;
}

export function OAHeader({ contextLabel, isAdmin = false }: OAHeaderProps) {
  const router = useRouter();
  const { currentUserId, signOut } = useAppState();
  const currentUserQuery = useCallback(
    (repository: OARepository) => currentUserId
      ? repository.getUserById(currentUserId)
      : Promise.resolve(null),
    [currentUserId],
  );
  const { data: currentUser } = useRepositoryQuery(currentUserQuery, [currentUserId]);
  const showAdmin = isAdmin || currentUser?.status === "ADMIN";

  async function logout() {
    await signOut();
    router.push("/login");
  }

  return (
    <header className="oa-header sticky top-0 z-40 h-16 border-b border-[var(--oa-line)] bg-[var(--oa-paper)]">
      <div className="mx-auto flex h-full w-full max-w-[1336px] items-center gap-6 px-[var(--oa-page-gutter)]">
        <Link
          className="inline-flex min-h-11 min-w-11 items-center no-underline lg:hidden"
          href="/"
          aria-label="OMNIVORE ARCHITECT home"
        >
          <OAMiniLogo className="h-3 w-6" />
        </Link>
        {contextLabel ? (
          <span className="ml-auto font-mono text-[length:var(--oa-type-meta)] tracking-[var(--oa-tracking-meta)] text-[var(--oa-secondary)]">
            OA / {contextLabel}
          </span>
        ) : null}
        <details className={contextLabel ? "relative" : "relative ml-auto"}>
          <summary className="oa-pressable flex min-h-11 min-w-11 list-none items-center justify-end text-[length:var(--oa-type-label)] font-bold tracking-[var(--oa-tracking-label)] [&::-webkit-details-marker]:hidden" aria-label="Open site menu">
            MENU
          </summary>
          <nav
            className="absolute right-0 top-[calc(100%+9px)] flex w-[min(280px,calc(100vw-40px))] flex-col border border-[var(--oa-ink)] bg-[var(--oa-paper)]"
            aria-label="Secondary navigation"
          >
            <Link className="flex min-h-13 items-center justify-between border-b border-[var(--oa-line)] px-4 text-[length:var(--oa-type-label)] font-bold tracking-[var(--oa-tracking-label)] no-underline hover:bg-[var(--oa-surface)]" href="/members">
              MEMBERS <span aria-hidden="true">→</span>
            </Link>
            <Link className="flex min-h-13 items-center justify-between border-b border-[var(--oa-line)] px-4 text-[length:var(--oa-type-label)] font-bold tracking-[var(--oa-tracking-label)] no-underline hover:bg-[var(--oa-surface)]" href="/about">
              ABOUT <span aria-hidden="true">→</span>
            </Link>
            {showAdmin ? (
              <Link className="flex min-h-13 items-center justify-between border-b border-[var(--oa-line)] px-4 text-[length:var(--oa-type-label)] font-bold tracking-[var(--oa-tracking-label)] no-underline hover:bg-[var(--oa-surface)]" href="/admin">
                ADMIN <span aria-hidden="true">→</span>
              </Link>
            ) : null}
            <button className="oa-pressable flex min-h-13 items-center justify-between border-0 bg-transparent px-4 text-left text-[length:var(--oa-type-label)] font-bold tracking-[var(--oa-tracking-label)] text-[var(--oa-ink)] hover:bg-[var(--oa-surface)]" type="button" onClick={() => void logout()}>
              LOGOUT <span aria-hidden="true">→</span>
            </button>
          </nav>
        </details>
      </div>
    </header>
  );
}
