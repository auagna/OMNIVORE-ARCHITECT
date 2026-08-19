import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LockedState } from "@/components/feedback/locked-state";

describe("LockedState", () => {
  it("keeps the Program TALK tab visible while explaining participant-only access", () => {
    render(
      <LockedState
        action={<a href="/programs/program-g028">JOIN GATHERING →</a>}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "PARTICIPANTS ONLY" }),
    ).toBeVisible();
    expect(
      screen.getByText(/참가자와\s*운영진만 이용할 수 있습니다/),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: /JOIN GATHERING/ }),
    ).toHaveAttribute("href", "/programs/program-g028");
  });
});
