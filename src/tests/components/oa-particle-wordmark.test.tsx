import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OAParticleWordmark } from "@/components/ui";

describe("OAParticleWordmark", () => {
  it("keeps a semantic static title when canvas enhancement is unavailable", () => {
    const { container } = render(<OAParticleWordmark />);

    expect(screen.getByRole("heading", { name: "OMNIVORE ARCHITECT", level: 1 })).toBeVisible();
    expect(container.querySelector("canvas")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("heading", { name: "OMNIVORE ARCHITECT" })).not.toHaveAttribute(
      "data-enhanced",
    );
  });
});
