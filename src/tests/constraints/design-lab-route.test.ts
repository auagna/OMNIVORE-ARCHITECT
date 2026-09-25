import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd());
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Design Lab route boundaries", () => {
  it("fails closed outside development and stays out of member navigation", () => {
    const page = source("src/app/(design)/design-lab/page.tsx");
    const nextConfig = source("next.config.ts");
    const navigation = [
      source("src/components/layout/bottom-navigation.tsx"),
      source("src/components/layout/oa-header.tsx"),
      source("src/components/layout/app-shell.tsx"),
    ].join("\n");

    expect(page).toContain("notFound()");
    expect(page).toContain("isDesignLabEnabled");
    expect(nextConfig).toContain('source: "/design-lab"');
    expect(nextConfig).toContain('destination: "/__design-lab-disabled"');
    expect(navigation).not.toContain("/design-lab");
  });

  it("uses production-connected Program and TALK patterns", () => {
    const page = source("src/app/(design)/design-lab/page.tsx");
    const conversation = source(
      "src/features/design-lab/components/design-lab-conversation.tsx",
    );
    const fixtures = source("src/features/design-lab/fixtures.ts");

    expect(page).toContain("ProgramEditorialList");
    expect(page).toContain("ProgramDetailHero");
    expect(page).toContain("PROGRAM_STATUSES");
    expect(page).toContain("DERIVED_PROGRAM_STATUSES");
    expect(page).toContain('aria-describedby="design-lab-title-help"');
    expect(page).toContain('headingLevel="h3"');
    expect(page).toContain('announce={false}');
    expect(conversation).toContain("ProgramTalkMessageFrame");
    expect(conversation).toContain("MessageReactionBar");
    expect(fixtures).toContain('type: "GATHERING"');
    expect(fixtures).toContain('category: "WORKSHOP"');
  });
});
