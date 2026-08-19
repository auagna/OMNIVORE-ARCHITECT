import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const projectRoot = resolve(process.cwd());

function source(path: string): string {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

describe("v3.1 member information architecture", () => {
  it("keeps Messages inside My instead of the desktop primary navigation", () => {
    const navigation = source("src/components/layout/bottom-navigation.tsx");
    const myPage = source("src/app/(member)/my/page.tsx");

    expect(navigation).not.toContain('label: "MESSAGES"');
    expect(myPage).toContain('id="my-messages"');
  });

  it("places action-required work between Next and Open on Home", () => {
    const home = source("src/app/(member)/page.tsx");
    const next = home.indexOf('id="next-heading"');
    const action = home.indexOf('id="my-action-heading"');
    const open = home.indexOf('id="open-heading"');
    const record = home.indexOf('id="record-heading"');

    expect(next).toBeGreaterThan(-1);
    expect(action).toBeGreaterThan(next);
    expect(open).toBeGreaterThan(action);
    expect(record).toBeGreaterThan(open);
  });
});
