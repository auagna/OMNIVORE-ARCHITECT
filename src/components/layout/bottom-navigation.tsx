"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { useCallback, type ReactNode } from "react";
import { OAMiniLogo } from "@/components/oa-mini-logo";
import { useAppState, useRepositoryQuery } from "@/features/app-state/app-state-provider";
import type { OARepository } from "@/lib/repositories";

interface NavigationItem {
  href: Route;
  label: string;
  icon: ReactNode;
  create?: boolean;
}

const iconClass = "h-[17px] w-[17px]";
const items: NavigationItem[] = [
  {
    href: "/",
    label: "HOME",
    icon: <svg className={iconClass} viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M2.5 9.25 10 2.5l7.5 6.75V17.5h-5v-5h-5v5h-5V9.25Z" stroke="currentColor" /></svg>,
  },
  {
    href: "/programs",
    label: "PROGRAMS",
    icon: <svg className={iconClass} viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 3h14v14H3V3Zm0 5h14M8 8v9" stroke="currentColor" /></svg>,
  },
  {
    href: "/gatherings/propose",
    label: "PROPOSE",
    create: true,
    icon: <span className="grid h-[38px] w-[38px] place-items-center bg-[var(--oa-ink)] text-[1.7rem] font-light leading-none text-[var(--oa-paper)] lg:h-8 lg:w-8 lg:text-2xl" aria-hidden="true">+</span>,
  },
  {
    href: "/calendar",
    label: "CALENDAR",
    icon: <svg className={iconClass} viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 5h14v12H3V5Zm0 4h14M6 2.5V7M14 2.5V7" stroke="currentColor" /></svg>,
  },
  {
    href: "/my",
    label: "MY",
    icon: <svg className={iconClass} viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="6.25" r="3.25" stroke="currentColor" /><path d="M3.75 17c.45-3.32 2.54-5 6.25-5s5.8 1.68 6.25 5" stroke="currentColor" /></svg>,
  },
];

function activePath(pathname: string, href: string) {
  const routePath = href.split(/[?#]/, 1)[0];
  if (routePath === "/") return pathname === "/";
  if (routePath === "/programs") return pathname.startsWith("/programs") || pathname.startsWith("/program/");
  return pathname === routePath || pathname.startsWith(routePath + "/");
}

export function BottomNavigation() {
  const pathname = usePathname();
  const { currentUserId } = useAppState();
  const currentUserQuery = useCallback(
    (repository: OARepository) => currentUserId
      ? repository.getUserById(currentUserId)
      : Promise.resolve(null),
    [currentUserId],
  );
  const { data: currentUser } = useRepositoryQuery(currentUserQuery, [currentUserId]);
  const desktopPrimary = [items[0], items[1], items[3], items[4]];
  const desktopSecondary: NavigationItem[] = [
    { href: "/members", label: "MEMBERS", icon: null },
  ];

  return (
    <>
      <nav className="oa-mobile-navigation" aria-label="Primary navigation">
        <div className="mx-auto grid h-full max-w-[680px] grid-cols-5">
          {items.map((item) => {
            const active = activePath(pathname, item.href);
            return (
              <Link
                className={
                  "relative flex min-h-11 min-w-0 flex-col items-center px-0.5 text-[length:var(--oa-type-meta)] font-bold tracking-[var(--oa-tracking-meta)] no-underline " +
                  (item.create ? "justify-center" : "justify-end gap-[7px] pb-[7px] pt-2") + " " +
                  (active ? "text-[var(--oa-ink)]" : "text-[var(--oa-secondary)]")
                }
                href={item.href}
                key={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={item.create ? "PROPOSE GATHERING" : undefined}
              >
                {active ? <span className="absolute -top-px left-[22%] right-[22%] h-0.5 bg-[var(--oa-ink)]" aria-hidden="true" /> : null}
                {item.icon}<span className={item.create ? "oa-visually-hidden" : undefined}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <aside className="oa-desktop-sidebar">
        <Link className="oa-desktop-brand" href="/" aria-label="OMNIVORE ARCHITECT home">
          <OAMiniLogo className="h-3 w-6" />
          <span>OMNIVORE<br />ARCHITECT</span>
        </Link>
        <nav className="oa-desktop-navigation" aria-label="Primary navigation">
          <div className="oa-desktop-nav-group">
            {desktopPrimary.map((item) => (
              <DesktopNavigationLink item={item} pathname={pathname} key={item.href} />
            ))}
          </div>
          <div className="oa-desktop-nav-group">
            {desktopSecondary.map((item) => (
              <DesktopNavigationLink item={item} pathname={pathname} key={item.href} />
            ))}
          </div>
          <div className="oa-desktop-nav-group">
            <DesktopNavigationLink item={items[2]} pathname={pathname} prefix="* " />
            {currentUser?.status === "ADMIN" ? (
              <DesktopNavigationLink item={{ href: "/admin", label: "ADMIN", icon: null }} pathname={pathname} />
            ) : null}
          </div>
        </nav>
      </aside>
    </>
  );
}

function DesktopNavigationLink({
  item,
  pathname,
  prefix,
}: {
  item: NavigationItem;
  pathname: string;
  prefix?: string;
}) {
  const active = activePath(pathname, item.href);
  return (
    <Link
      className="oa-desktop-nav-link"
      data-active={active ? "true" : undefined}
      href={item.href}
      aria-current={active ? "page" : undefined}
    >
      {prefix ? <span aria-hidden="true">{prefix}</span> : null}{item.label}
    </Link>
  );
}
