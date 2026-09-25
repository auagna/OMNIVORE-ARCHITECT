import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DesignLabControlSpecimens } from "@/features/design-lab/components/design-lab-control-specimens";

describe("Design Lab control specimens", () => {
  it("keeps focusable button specimens functional", async () => {
    const user = userEvent.setup();
    render(<DesignLabControlSpecimens />);

    await user.click(screen.getByRole("button", { name: "SECONDARY" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "SECONDARY 버튼을 실행했습니다.",
    );
  });
});
