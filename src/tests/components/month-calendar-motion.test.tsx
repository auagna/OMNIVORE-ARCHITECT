import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MonthCalendar } from "@/features/programs/components/month-calendar";

describe("MonthCalendar interaction", () => {
  it("keeps the semantic table and an immediate selected state", () => {
    render(
      <MonthCalendar
        month="2026-08"
        selectedDate="2026-08-08"
        scope="ALL"
        programs={[]}
        today="2026-08-08"
      />,
    );

    expect(screen.getByRole("table")).toBeVisible();
    const dayLinks = screen.getAllByRole("link");
    expect(dayLinks[0]).not.toHaveAttribute("data-motion-cell");
    expect(screen.getByRole("link", { name: /2026년 8월 8일/ })).toHaveAttribute(
      "aria-current",
      "date",
    );
  });
});
