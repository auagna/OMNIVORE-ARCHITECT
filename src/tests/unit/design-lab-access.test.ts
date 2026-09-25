import { describe, expect, it } from "vitest";
import { isDesignLabEnabled } from "@/features/design-lab/design-lab-access";

describe("Design Lab access", () => {
  it("is available only in development", () => {
    expect(isDesignLabEnabled("development")).toBe(true);
    expect(isDesignLabEnabled("production")).toBe(false);
    expect(isDesignLabEnabled("test")).toBe(false);
    expect(isDesignLabEnabled(undefined)).toBe(false);
  });
});
