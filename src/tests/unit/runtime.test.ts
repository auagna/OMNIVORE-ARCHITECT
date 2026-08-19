import { describe, expect, it } from "vitest";

import { resolveDataSourceMode } from "@/lib/runtime-config";

describe("runtime configuration smoke test", () => {
  it("keeps mock as the explicit local default", () => {
    expect(resolveDataSourceMode("mock")).toBe("mock");
  });
});
