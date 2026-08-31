import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { PAGE_CONTENT_KEYS } from "../../constants/program";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260831030000_seed_default_page_content.sql",
);
const sql = readFileSync(migrationPath, "utf8");
const readme = readFileSync(resolve(process.cwd(), "README.md"), "utf8");
const mockData = readFileSync(
  resolve(process.cwd(), "src/lib/repositories/mock-data.ts"),
  "utf8",
);

const expectedDefaults = [
  {
    key: "home",
    title: "HOME",
    headline: "지금 OMNIVORE에서 일어나는 일",
    description: "가장 가까운 일정과 참여 가능한 Program을 확인합니다.",
    emptyState: "예정된 Program이 없습니다.",
  },
  {
    key: "programs",
    title: "PROGRAMS",
    headline: "PROGRAMS",
    description: "Talk, Reading, Gathering을 날짜 순서로 살펴봅니다.",
    emptyState: "조건에 맞는 Program이 없습니다.",
  },
  {
    key: "talk",
    title: "TALK",
    headline: "강연",
    description: "OMNIVORE와 외부에서 열리는 Talk입니다.",
    emptyState: "등록된 Talk가 없습니다.",
  },
  {
    key: "reading",
    title: "READING",
    headline: "함께 읽기",
    description: "하나의 텍스트를 중심으로 모이는 Program입니다.",
    emptyState: "등록된 Reading이 없습니다.",
  },
  {
    key: "gathering",
    title: "번개",
    headline: "GATHERING",
    description: "멤버가 제안하고 운영진이 승인한 모임입니다.",
    emptyState: "참여 가능한 Gathering이 없습니다.",
  },
  {
    key: "members",
    title: "MEMBERS",
    headline: "OMNIVORE MEMBERS",
    description: "함께 활동하는 멤버를 확인합니다.",
    emptyState: "표시할 Member가 없습니다.",
  },
  {
    key: "about",
    title: "ABOUT",
    headline: "OMNIVORE ARCHITECT",
    description: "활동을 만들고, 사람이 모이고, 대화하고, 기록이 남는 시스템.",
    emptyState: "",
  },
] as const;

function seedValues(): string {
  const match = sql.match(
    /insert into public\.page_content\s*\([\s\S]*?\)\s*values([\s\S]*?)on conflict\s*\(key\)\s*do nothing/i,
  );
  expect(match?.[1], "PageContent seed values").toBeDefined();
  return match?.[1] ?? "";
}

describe("Supabase default PageContent seed", () => {
  it("seeds exactly the seven typed PageContent keys without overwriting edits", () => {
    const values = seedValues();
    const rows = [
      ...values.matchAll(
        /\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*null\s*\)/g,
      ),
    ].map(([, key, title, headline, description, emptyState]) => ({
      key,
      title,
      headline,
      description,
      emptyState,
    }));

    expect(PAGE_CONTENT_KEYS).toHaveLength(7);
    expect(expectedDefaults.map(({ key }) => key)).toEqual(PAGE_CONTENT_KEYS);
    expect(rows).toEqual(expectedDefaults);
    expect(sql).toMatch(/on conflict\s*\(key\)\s*do nothing/i);
    expect(sql).not.toMatch(/on conflict[\s\S]*do update/i);
  });

  it("keeps the production defaults aligned with the current mock content", () => {
    for (const row of expectedDefaults) {
      expect(mockData).toContain(`key: ${JSON.stringify(row.key)}`);
      expect(mockData).toContain(`title: ${JSON.stringify(row.title)}`);
      expect(mockData).toContain(`headline: ${JSON.stringify(row.headline)}`);
      expect(mockData).toContain(
        `description: ${JSON.stringify(row.description)}`,
      );
      expect(mockData).toContain(
        `emptyState: ${JSON.stringify(row.emptyState)}`,
      );
    }
  });

  it("forces a fresh server timestamp before every PageContent update", () => {
    expect(sql).toMatch(
      /create or replace function public\.set_page_content_updated_at\(\)[\s\S]*returns trigger[\s\S]*set search_path = ''/i,
    );
    expect(sql).toMatch(/new\.updated_at := clock_timestamp\(\)/i);
    expect(sql).toMatch(
      /create trigger set_page_content_updated_at\s*before update on public\.page_content\s*for each row\s*execute function public\.set_page_content_updated_at\(\)/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.set_page_content_updated_at\(\)[\s\S]*from public, anon, authenticated/i,
    );
  });

  it("documents the full manual order and keeps CLI history distinct", () => {
    expect(readme).toMatch(
      /20260830000000_admin_operations\.sql[\s\S]*20260831000000_create_message_reactions\.sql[\s\S]*20260831010000_add_program_message_hidden_state\.sql[\s\S]*20260831020000_seed_default_seasons\.sql[\s\S]*20260831030000_seed_default_page_content\.sql/i,
    );
    expect(readme).toContain("Supabase SQL Editor");
    expect(readme).toContain("supabase migration list");
    expect(readme).toContain("supabase db push");
    expect(readme).not.toContain(
      "Before opening registration, create the real `Season` rows in Supabase.",
    );
  });
});
