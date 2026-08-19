import type { ReactNode } from "react";

import { BottomNavigation } from "./bottom-navigation";
import { OAHeader } from "./oa-header";
import { RouteTransition } from "./route-transition";

export interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="oa-app-shell">
      <a className="oa-skip-link" href="#main-content">SKIP TO CONTENT</a>
      <OAHeader />
      <div
        className="oa-shell-content"
        id="main-content"
        tabIndex={-1}
      >
        <RouteTransition>{children}</RouteTransition>
      </div>
      <BottomNavigation />
    </div>
  );
}
