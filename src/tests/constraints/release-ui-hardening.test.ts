import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const projectRoot = resolve(process.cwd());

function source(path: string): string {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

function sourceFiles(directory: string): string[] {
  return readdirSync(resolve(projectRoot, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}

describe("v3.2 release UI hardening", () => {
  it("uses one upper-right-notch mini-logo silhouette source", () => {
    const favicon = source("src/app/icon.svg");
    const logo = source("src/components/oa-mini-logo.tsx");
    const globals = source("src/app/globals.css");
    const loading = source("src/app/loading.tsx");
    const programDetail = source("src/app/(member)/program/[programId]/page.tsx");

    expect(favicon).toContain('viewBox="0 0 100 50"');
    expect(favicon).toContain('d="M0 0H77V22H100V50H0Z"');
    expect(favicon).not.toContain('d="M0 0H23V7H32V24H0Z"');
    expect(logo).not.toContain("<svg");
    expect(logo).not.toContain("<path");
    expect(logo).toContain("oa-mini-logo");
    expect(globals).toContain('mask: url("/icon.svg")');
    expect(loading).toContain("<OAMiniLogo");
    expect(programDetail).toContain("<OAMiniLogo");
  });

  it("keeps approved visual and motion primitives within the release scope", () => {
    const combined = [
      source("src/app/globals.css"),
      source("src/app/(member)/member.css"),
      source("src/app/admin/admin.css"),
    ].join("\n");

    expect(combined).not.toMatch(/rounded-(?:xl|2xl|3xl)/);
    expect(combined).not.toMatch(/shadow-(?:lg|xl|2xl)/);
    expect(combined).not.toMatch(/(?:bg-)?gradient|linear-gradient|radial-gradient/);
    expect(combined).not.toMatch(/Fisheye|Flip Stack|Collection Surfer|Complex Scroll/i);
    expect(combined).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("keeps the Componentry-inspired motion bounded and accessible", () => {
    const wordmark = source("src/components/ui/oa-particle-wordmark.tsx");
    const calendar = source("src/features/programs/components/month-calendar.tsx");
    const packageJson = source("package.json");

    expect(wordmark).toContain("prefers-reduced-motion: no-preference");
    expect(wordmark).toContain("pointer: fine");
    expect(wordmark).toContain("IntersectionObserver");
    expect(wordmark).toContain('aria-label="OMNIVORE ARCHITECT"');
    expect(wordmark).toContain('canvas aria-hidden="true"');
    expect(wordmark).toContain("cancelAnimationFrame");
    expect(calendar).not.toContain('data-motion-cell="true"');
    expect(calendar).not.toContain("--oa-cell-index");
    expect(packageJson).not.toContain("framer-motion");
    expect(wordmark).not.toContain("github-contributions-api");
  });

  it("uses settled OA motion tokens and pointer-only press feedback", () => {
    const globals = source("src/app/globals.css");
    const member = source("src/app/(member)/member.css");
    const routeTransition = source("src/components/layout/route-transition.tsx");

    expect(globals).toContain("--motion-fast: 120ms");
    expect(globals).toContain("--ease-ui: cubic-bezier(0.2, 0, 0, 1)");
    expect(globals).toContain("--ease-editorial: cubic-bezier(0.16, 1, 0.3, 1)");
    expect(globals).toContain(":active:not(:disabled):not(:focus-visible)");
    expect(globals).toContain("transform: scale(.96)");
    expect(`${globals}\n${member}`).not.toMatch(/transition\s*:\s*all/i);
    expect(routeTransition).toContain('anchor.closest("nav")');
    expect(routeTransition).toContain("event.detail === 0");
  });

  it("disambiguates Tailwind typography tokens as lengths", () => {
    const ambiguousTypeTokenFiles = sourceFiles("src")
      .filter((path) => /\.tsx?$/.test(path))
      .filter((path) => /text-\[var\(--oa-type-(?:section|label|meta)\)\]/.test(source(path)));

    expect(ambiguousTypeTokenFiles).toEqual([]);
  });

  it("provides recoverable query errors and a valid segment error boundary", () => {
    const queryState = source("src/features/programs/views/query-state.tsx");
    const errorState = source("src/components/feedback/error-state.tsx");
    const segmentError = source("src/app/error.tsx");

    expect(queryState).toContain("onRetry?: () => void");
    expect(queryState).toContain("window.location.reload()");
    expect(errorState).toContain("action?: ReactNode");
    expect(segmentError).not.toContain("<html");
    expect(segmentError).not.toContain("<body");
    expect(segmentError).toContain("onClick={reset}");
  });

  it("removes development-only controls and stale phase copy from member UI", () => {
    const myPage = source("src/app/(member)/my/page.tsx");
    const overview = source("src/app/admin/admin-overview.tsx");

    expect(myPage).not.toContain("RESET MOCK DATA");
    expect(myPage).not.toContain("PHASE 4");
    expect(myPage).not.toContain("후속 Phase");
    expect(overview).not.toContain("CONVERSATION PHASE");
  });
});
