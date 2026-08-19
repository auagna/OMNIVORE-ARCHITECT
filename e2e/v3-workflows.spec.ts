import { expect, type Page, test } from "@playwright/test";

const runtimeErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }, testInfo) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  test.skip(testInfo.project.name !== "mobile-390", "v3 workflow QA runs at the 390px target viewport");
});

test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page) ?? [], "browser runtime errors").toEqual([]);
});

async function resetMock(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
}

async function signInAs(page: Page, identity: "MEMBER" | "ADMIN"): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(`CONTINUE AS ${identity}`, "i") }).click();
  await expect(page).toHaveURL(identity === "ADMIN" ? /\/admin(?:\?.*)?$/ : /\/$/);
}

async function createProposal(page: Page, title: string): Promise<string> {
  await page.goto("/gatherings/propose");
  await page.getByLabel(/^TITLE$/i).fill(title);
  await page.getByLabel(/^CATEGORY$/i).selectOption("WORKSHOP");
  await page.getByRole("button", { name: /^NEXT$/i }).click();

  await page.getByLabel(/^DATE$/i).fill("2026-09-05");
  await page.getByLabel(/^START TIME$/i).fill("18:30");
  await page.getByLabel(/^END TIME$/i).fill("20:30");
  await page.getByLabel(/^PLACE$/i).fill("청계천 세운광장");
  await page.getByLabel(/^MEETING POINT$/i).fill("세운상가 다시세운광장 입구");
  await page.getByRole("button", { name: /^NEXT$/i }).click();

  await page.getByLabel(/^CAPACITY$/i).fill("10");
  await page.getByRole("button", { name: /^NEXT$/i }).click();

  await page.getByRole("radio", { name: /^HOST[ _]COLLECT$/i }).check();
  await page.getByLabel(/^PARTICIPATION FEE$/i).fill("25000");
  await page.getByLabel(/^FEE INCLUDES$/i).fill("재료와 공구 대여");
  await page.getByLabel(/^PAYMENT INFO$/i).fill("신한 000-000-000000 오민서");
  await page.getByLabel(/^PAYMENT DEADLINE$/i).fill("2026-09-02T18:00");
  await page.getByLabel(/^CANCELLATION POLICY$/i).fill("취소 시 별도 안내");
  await page.getByRole("button", { name: /^NEXT$/i }).click();

  await page
    .getByLabel(/^DESCRIPTION$/i)
    .fill("청계천과 세운상가 주변의 야간 도시 공간을 함께 걷고 관찰합니다.");
  await page.getByRole("button", { name: /^PREVIEW$/i }).click();
  await page.getByRole("button", { name: /^SUBMIT FOR APPROVAL/i }).click();

  await expect(page).toHaveURL(/\/my\?proposal=.*&status=pending$/);
  const proposalId = new URL(page.url()).searchParams.get("proposal");
  expect(proposalId).toBeTruthy();
  return proposalId as string;
}

test.describe("v3 approval, calendar, export, and content workflows", () => {
  test("Admin requests changes → Member resubmits → Admin approves → Program is OPEN", async ({ page }) => {
    await resetMock(page);
    const originalTitle = "작은 재료 오브젝트 워크숍";
    const revisedTitle = "작은 목재 오브젝트 워크숍";
    const proposalId = await createProposal(page, originalTitle);

    await expect(page.getByRole("heading", { name: originalTitle })).toBeVisible();
    await expect(page.getByText(/^PENDING$/i).first()).toBeVisible();
    await page.goto("/programs?type=GATHERING");
    await expect(page.getByRole("heading", { name: originalTitle })).toHaveCount(0);

    await signInAs(page, "ADMIN");
    await page.goto("/admin?view=approvals");
    await page.getByRole("link", { name: new RegExp(originalTitle) }).click();
    await expect(page).toHaveURL(new RegExp(`program=${proposalId}`));
    const review = page.getByRole("region", { name: "Gathering proposal details" });
    await expect(page.getByText("GATHERING / WORKSHOP", { exact: false }).first()).toBeVisible();
    await expect(review).toContainText("오민서");
    await expect(review).toContainText("05 SEPT 2026");
    await expect(review).toContainText("18:30—20:30");
    await expect(review).toContainText("청계천 세운광장");
    await expect(review).toContainText("10 PEOPLE");
    await expect(review).toContainText("25,000 KRW");
    await expect(review).toContainText("신한 000-000-000000 오민서");
    await expect(review).toContainText("취소 시 별도 안내");
    await expect(review).toContainText("청계천과 세운상가 주변의 야간 도시 공간");
    await page.getByLabel(/REVIEW COMMENT/i).fill("환불 기준을 명확하게 작성해주세요.");
    await page.getByRole("button", { name: /^REQUEST CHANGES$/i }).click();
    await expect(page.getByRole("status")).toContainText("CHANGES REQUESTED");

    await signInAs(page, "MEMBER");
    await page.goto("/my");
    const revision = page.getByRole("article").filter({ hasText: originalTitle });
    await expect(revision.getByText(/^NEEDS REVISION$/i)).toBeVisible();
    await expect(revision).toContainText("환불 기준을 명확하게 작성해주세요.");
    await revision.getByRole("link", { name: /^EDIT/i }).click();

    await expect(page.getByText(/^NEEDS REVISION$/i)).toBeVisible();
    await page.getByLabel(/^TITLE$/i).fill(revisedTitle);
    await page.getByRole("button", { name: /^NEXT$/i }).click();
    await page.getByRole("button", { name: /^NEXT$/i }).click();
    await page.getByRole("button", { name: /^NEXT$/i }).click();
    await page
      .getByLabel(/^CANCELLATION POLICY$/i)
      .fill("행사 3일 전까지 전액 환불, 이후에는 재료 준비 비용을 제외하고 환불합니다.");
    await page.getByRole("button", { name: /^NEXT$/i }).click();
    await page.getByRole("button", { name: /^PREVIEW$/i }).click();
    await page.getByRole("button", { name: /^RESUBMIT FOR APPROVAL/i }).click();
    await expect(page).toHaveURL(new RegExp(`/my\\?proposal=${proposalId}&status=pending$`));
    await expect(page.getByRole("heading", { name: revisedTitle })).toBeVisible();
    await expect(page.getByText(/^PENDING$/i).first()).toBeVisible();

    await signInAs(page, "ADMIN");
    await page.goto("/admin?view=approvals");
    await page.getByRole("link", { name: new RegExp(revisedTitle) }).click();
    await expect(page.getByRole("region", { name: "Gathering proposal details" })).toContainText(
      "행사 3일 전까지 전액 환불",
    );
    await page.getByRole("button", { name: /^APPROVE/i }).click();
    await expect(page.getByRole("status")).toContainText("APPROVED");

    await signInAs(page, "MEMBER");
    await page.goto("/programs?type=GATHERING");
    await page.getByRole("link", { name: new RegExp(revisedTitle) }).click();
    await expect(page).toHaveURL(new RegExp(`/program/${proposalId}$`));
    const storedProgramStatus = await page.evaluate((targetProgramId) => {
      const storageKey = Object.keys(window.localStorage).find((key) =>
        key.startsWith("oa:mock-repository:"),
      );
      const rawState = storageKey ? window.localStorage.getItem(storageKey) : null;
      if (!rawState) return null;
      const state = JSON.parse(rawState) as {
        programs?: Array<{ id: string; status: string }>;
      };
      return state.programs?.find((program) => program.id === targetProgramId)?.status ?? null;
    }, proposalId);
    expect(storedProgramStatus).toBe("OPEN");
    await expect(page.getByText(/^RECRUITING$/i).first()).toBeVisible();

    await page.goto("/");
    const homeProgram = page.getByRole("article").filter({ hasText: revisedTitle });
    await expect(homeProgram).toContainText("GATHERING / WORKSHOP");
    await expect(homeProgram).toContainText("18:30 · 청계천 세운광장");

    await page.goto("/calendar?month=2026-09&scope=all&date=2026-09-05");
    const calendarProgram = page.getByRole("article").filter({ hasText: revisedTitle });
    await expect(calendarProgram).toContainText("GATHERING / WORKSHOP");
    await expect(calendarProgram).toContainText("18:30 · 청계천 세운광장");

    await page.goto(`/program/${proposalId}`);
    await expect(page.getByRole("heading", { name: revisedTitle })).toBeVisible();
    await expect(page.getByText("25,000 KRW", { exact: true })).toBeVisible();
    await expect(page.getByText(/00\s*\/\s*10/).first()).toBeVisible();

    await page.goto("/my");
    const hosting = page.getByRole("link", { name: new RegExp(revisedTitle) });
    await expect(hosting).toContainText("RECRUITING · 0/10");
  });

  test("Month Calendar switches between ALL and MINE", async ({ page }) => {
    await resetMock(page);
    await page.goto("/program/program-gathering-028");
    await page.getByRole("button", { name: /^JOIN/i }).click();
    await page.getByRole("button", { name: /^CONFIRM JOIN$/i }).click();
    await expect(page).toHaveURL(/\/my\?joined=/);

    await page.goto("/calendar?month=2026-08&scope=all&date=2026-08-29");
    await page.getByRole("link", { name: /^NEXT MONTH$/i }).click();
    await expect(page).toHaveURL(/month=2026-09/);
    await expect(page.getByRole("heading", { name: /SEPTEMBER.*2026/i })).toBeVisible();
    await page.getByRole("link", { name: /^PREVIOUS MONTH$/i }).click();
    await expect(page).toHaveURL(/month=2026-08/);
    await page.goto("/calendar?month=2026-08&scope=all&date=2026-08-29");
    const scope = page.getByRole("navigation", { name: "Calendar scope" });
    await expect(scope.getByRole("link", { name: "ALL" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: "작은 목재 오브젝트 만들기" })).toBeVisible();

    await scope.getByRole("link", { name: "MINE" }).click();
    await expect(page).toHaveURL(/scope=mine/);
    await expect(scope.getByRole("link", { name: "MINE" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: "작은 목재 오브젝트 만들기" })).toHaveCount(0);
    await expect(page.getByText(/^0 PROGRAMS$/i)).toBeVisible();

    await page.getByRole("link", { name: /2026년 8월 22일.*Program 1개/i }).click();
    await expect(page.getByRole("heading", { name: "리움 전시 같이 보기" })).toBeVisible();
    await expect(page.getByText(/^1 PROGRAM$/i)).toBeVisible();
  });

  test("Add to Calendar produces a Google URL and an ICS download", async ({ page }) => {
    await resetMock(page);
    await page.goto("/program/program-gathering-028");
    await page.evaluate(() => {
      const target = window as Window & { __oaGoogleCalendarUrl?: string };
      window.open = ((url?: string | URL) => {
        target.__oaGoogleCalendarUrl = String(url ?? "");
        return null;
      }) as typeof window.open;
    });

    await page.getByText("ADD TO CALENDAR", { exact: true }).click();
    await page.getByRole("button", { name: /^GOOGLE CALENDAR/i }).click();
    const googleUrl = await page.evaluate(
      () => (window as Window & { __oaGoogleCalendarUrl?: string }).__oaGoogleCalendarUrl,
    );
    expect(googleUrl).toBeTruthy();
    const parsedGoogleUrl = new URL(googleUrl as string);
    expect(parsedGoogleUrl.origin).toBe("https://calendar.google.com");
    expect(parsedGoogleUrl.searchParams.get("text")).toBe("리움 전시 같이 보기");
    expect(parsedGoogleUrl.searchParams.get("dates")).toBe("20260822T050000Z/20260822T080000Z");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /^DOWNLOAD \.ICS/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("oa-g028.ics");
  });

  test("Admin Content saves the Gathering headline and updates Programs", async ({ page }) => {
    await resetMock(page);
    await signInAs(page, "ADMIN");
    await page.goto("/admin?view=content&key=gathering");

    const headline = "멤버가 제안하고 함께 여는 작은 모임";
    await page.getByLabel(/^HEADLINE$/i).fill(headline);
    await page.getByRole("button", { name: /^SAVE/i }).click();
    await expect(page.getByRole("status")).toHaveText("SAVED / MEMBER VIEW UPDATED");

    await page.goto("/programs?type=GATHERING");
    await expect(page.getByText(headline, { exact: true })).toBeVisible();
  });
});
