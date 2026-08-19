import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RouteTransition } from "@/components/layout/route-transition";

const route = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
}));

function TestRoute({ inNavigation = false }: { inNavigation?: boolean }) {
  const link = <a href="/programs" onClick={(event) => event.preventDefault()}>PROGRAMS</a>;
  return (
    <main id="main-content" tabIndex={-1}>
      <RouteTransition>
        <h1>Current page</h1>
        {inNavigation ? <nav>{link}</nav> : link}
      </RouteTransition>
    </main>
  );
}

describe("RouteTransition", () => {
  it("uses a short enter cue for pointer navigation from editorial content", () => {
    route.pathname = "/";
    const { rerender } = render(<TestRoute />);

    fireEvent.click(screen.getByRole("link", { name: "PROGRAMS" }), { detail: 1, button: 0 });
    route.pathname = "/programs";
    rerender(<TestRoute />);

    expect(screen.getByRole("heading", { name: "Current page" }).parentElement).toHaveAttribute(
      "data-route-motion",
      "enter",
    );
  });

  it("keeps keyboard and navigation-bar route changes static", () => {
    route.pathname = "/";
    const { rerender } = render(<TestRoute inNavigation />);

    fireEvent.click(screen.getByRole("link", { name: "PROGRAMS" }), { detail: 0 });
    route.pathname = "/programs";
    rerender(<TestRoute inNavigation />);

    expect(screen.getByRole("heading", { name: "Current page" }).parentElement).toHaveAttribute(
      "data-route-motion",
      "static",
    );
    expect(screen.getByRole("heading", { name: "Current page" })).toHaveFocus();
  });
});
