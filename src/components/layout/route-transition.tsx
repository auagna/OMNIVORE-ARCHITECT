"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

export interface RouteTransitionProps {
  children: ReactNode;
}

export function RouteTransition({ children }: RouteTransitionProps) {
  const pathname = usePathname();
  const keyboardDestination = useRef<string | null>(null);
  const [pointerDestination, setPointerDestination] = useState<string | null>(null);

  useEffect(() => {
    function prepareRouteMotion(event: globalThis.MouseEvent) {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname === pathname) return;

      if (event.detail === 0) {
        keyboardDestination.current = destination.pathname;
        setPointerDestination(null);
        return;
      }

      if (anchor.closest("nav")) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      setPointerDestination(destination.pathname);
    }

    document.addEventListener("click", prepareRouteMotion, true);
    return () => document.removeEventListener("click", prepareRouteMotion, true);
  }, [pathname]);

  useLayoutEffect(() => {
    if (keyboardDestination.current !== pathname) return;

    keyboardDestination.current = null;
    const main = document.getElementById("main-content");
    const heading = main?.querySelector<HTMLElement>("h1");
    const focusTarget = heading ?? main;
    if (!focusTarget) return;

    const restoreTabIndex = heading && !heading.hasAttribute("tabindex");
    if (restoreTabIndex) heading.setAttribute("tabindex", "-1");
    focusTarget.focus({ preventScroll: true });

    if (restoreTabIndex) {
      heading.addEventListener("blur", () => heading.removeAttribute("tabindex"), { once: true });
    }
  }, [pathname]);

  const shouldAnimate = pointerDestination === pathname;

  return (
    <div
      className={shouldAnimate ? "oa-route-transition" : undefined}
      data-route-motion={shouldAnimate ? "enter" : "static"}
      key={pathname}
      onAnimationEnd={() => setPointerDestination(null)}
    >
      {children}
    </div>
  );
}
