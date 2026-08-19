import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProgramTabs } from "@/features/programs/components/program-tabs";

describe("ProgramTabs", () => {
  it("keeps TALK discoverable for a non-participant instead of hiding the tab", () => {
    render(
      <ProgramTabs
        items={[
          { label: "INFO", href: "/programs/program-g028" },
          {
            label: "TALK",
            href: "/programs/program-g028?tab=talk",
            active: true,
          },
          { label: "PEOPLE", href: "/programs/program-g028?tab=people" },
        ]}
      />,
    );

    const tabs = screen.getByRole("navigation", { name: "Program sections" });

    expect(within(tabs).getByRole("link", { name: "INFO" })).toBeVisible();
    expect(within(tabs).getByRole("link", { name: "TALK" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(tabs).getByRole("link", { name: "PEOPLE" })).toBeVisible();
  });
});
