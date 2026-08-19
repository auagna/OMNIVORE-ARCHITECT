import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const projectRoot = resolve(process.cwd());

function source(path: string): string {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

describe("v3.1 capability-driven UI", () => {
  it("keeps editorial discovery links neutral without implying join permission", () => {
    const editorialLink = source(
      "src/features/programs/views/program-editorial-link.tsx",
    );

    expect(editorialLink).toContain('action ?? "VIEW →"');
    expect(editorialLink).not.toContain("JOIN →");
    expect(editorialLink).not.toContain("snapshot.displayStatus ===");
  });

  it("uses the domain capability for the admin review affordance", () => {
    const approvals = source("src/app/admin/admin-approvals.tsx");

    expect(approvals).toContain("getProgramCapabilities({");
    expect(approvals).toContain("user: data.reviewer");
    expect(approvals).toContain("}).canReviewApproval");
    expect(approvals).not.toContain('approval.status === "PENDING"');
  });

  it("uses the approval capability for proposal revision affordance", () => {
    const myPage = source("src/app/(member)/my/page.tsx");

    expect(myPage).toContain("getProgramCapabilities({");
    expect(myPage).toContain("}).canSubmitForApproval");
    expect(myPage).toContain("{canRevise ? (");
  });
});
