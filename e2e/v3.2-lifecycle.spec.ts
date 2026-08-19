import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

const AUTH_STORAGE_KEY = "oa:mock-auth:v1";
const EXHIBITION_ID = "program-gathering-028";
const WORKSHOP_ID = "program-gathering-029";
const TALK_ID = "program-talk-027";

const runtimeErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }, testInfo) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  test.skip(
    testInfo.project.name !== "mobile-390",
    "Lifecycle role/state coverage runs once at the primary 390px viewport",
  );
});

test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page) ?? [], "browser runtime errors").toEqual([]);
});

async function resetMock(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
}

async function useMockUser(page: Page, userId: string): Promise<void> {
  await page.evaluate(
    ({ storageKey, value }) => window.localStorage.setItem(storageKey, value),
    { storageKey: AUTH_STORAGE_KEY, value: userId },
  );
}

async function joinProgram(page: Page, programId: string): Promise<void> {
  await page.goto(`/program/${programId}`);
  await page.getByRole("button", { name: /^JOIN(?:\s*→)?$/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /^CONFIRM JOIN$/i }).click();
  await expect(page).toHaveURL(new RegExp(`/my\\?joined=${programId}`));
}

async function advanceEditToPreview(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^NEXT$/i }).click();
  await page.getByRole("button", { name: /^NEXT$/i }).click();
  await page.getByRole("button", { name: /^NEXT$/i }).click();
  await page.getByRole("button", { name: /^PREVIEW$/i }).click();
  await page.getByRole("button", { name: /^SAVE CHANGES/i }).click();
}

async function storedApprovalStatus(page: Page, programId: string): Promise<string | null> {
  return page.evaluate((targetProgramId) => {
    const storageKey = Object.keys(window.localStorage).find((key) =>
      key.startsWith("oa:mock-repository:"),
    );
    if (!storageKey) return null;
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const state = JSON.parse(raw) as {
      approvals?: Array<{ programId: string; status: string }>;
    };
    return state.approvals?.find((approval) => approval.programId === targetProgramId)?.status ?? null;
  }, programId);
}

test.describe("v3.2 lifecycle state matrix", () => {
  test("direct TALK is locked, JOIN unlocks it, and participant cancellation keeps it read-only", async ({
    page,
  }) => {
    await resetMock(page);

    await page.goto(`/program/${EXHIBITION_ID}?tab=talk`);
    await expect(page.getByRole("heading", { name: "PARTICIPANTS ONLY" })).toBeVisible();
    await expect(page.getByLabel(/^MESSAGE$/i)).toHaveCount(0);

    await joinProgram(page, EXHIBITION_ID);
    await page.goto(`/program/${EXHIBITION_ID}?tab=talk`);
    await expect(page.getByText(/^ACTIVE$/i)).toBeVisible();
    await page.getByLabel(/^MESSAGE$/i).fill("참가 후 확인하는 운영 대화입니다.");
    await page.getByRole("button", { name: /^POST CHAT/i }).click();
    await expect(page.getByText("참가 후 확인하는 운영 대화입니다.", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: /^CANCEL PARTICIPATION/i }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^CANCEL PARTICIPATION$/i })
      .click();
    await expect(page.getByRole("status")).toContainText("참여가 취소되었습니다");
    await expect(page.getByText(/^READ ONLY$/i)).toBeVisible();
    await expect(page.getByText("참가 후 확인하는 운영 대화입니다.", { exact: true })).toBeVisible();
    await expect(page.getByLabel(/^MESSAGE$/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^POST (CHAT|QUESTION|NOTICE)/i })).toHaveCount(0);
    await page.goto(`/program/${EXHIBITION_ID}`);
    await expect(page.getByText(/06\s*\/\s*08/).first()).toBeVisible();
  });

  test("a full Gathering places the next Member on WAITLIST and keeps TALK locked", async ({
    page,
  }) => {
    await resetMock(page);

    await useMockUser(page, "user-host-workshop");
    await joinProgram(page, EXHIBITION_ID);
    await useMockUser(page, "user-host-reading");
    await joinProgram(page, EXHIBITION_ID);
    await useMockUser(page, "user-current");

    await page.goto(`/program/${EXHIBITION_ID}`);
    await expect(page.getByText(/^FULL$/i)).toBeVisible();
    await joinProgram(page, EXHIBITION_ID);
    await expect(page).toHaveURL(new RegExp(`status=waitlist`));

    await page.goto(`/program/${EXHIBITION_ID}?tab=talk`);
    await expect(page.getByText(/PARTICIPATION\s*\/\s*WAITLIST/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "PARTICIPANTS ONLY" })).toBeVisible();
    await expect(page.getByLabel(/^MESSAGE$/i)).toHaveCount(0);
  });

  test("QUESTION reply and pinned NOTICE keep role permissions and editorial hierarchy", async ({
    page,
  }) => {
    await resetMock(page);
    await joinProgram(page, EXHIBITION_ID);

    await page.goto(`/program/${EXHIBITION_ID}?tab=talk`);
    const memberType = page.getByLabel(/^TYPE$/i);
    await expect(memberType.locator('option[value="NOTICE"]')).toHaveCount(0);
    await memberType.selectOption("QUESTION");
    await page.getByLabel(/^MESSAGE$/i).fill("입장권은 각자 미리 구매하면 될까요?");
    await page.getByRole("button", { name: /^POST QUESTION/i }).click();
    const question = page
      .locator(".oa-talk-message")
      .filter({ hasText: "입장권은 각자 미리 구매하면 될까요?" });
    await expect(question).toContainText("QUESTION");

    await useMockUser(page, "user-host-exhibition");
    await page.goto(`/program/${EXHIBITION_ID}?tab=talk`);
    await page
      .locator(".oa-talk-message")
      .filter({ hasText: "입장권은 각자 미리 구매하면 될까요?" })
      .getByRole("button", { name: /^REPLY/i })
      .click();
    await expect(page.getByRole("status")).toContainText("REPLY");
    await page.getByLabel(/^MESSAGE$/i).fill("네, 각자 예매 후 집결 장소에서 만나면 됩니다.");
    await page.getByRole("button", { name: /^POST CHAT/i }).click();
    const reply = page
      .locator('.oa-talk-message[data-reply="true"]')
      .filter({ hasText: "네, 각자 예매 후 집결 장소에서 만나면 됩니다." });
    await expect(reply).toBeVisible();

    await page.getByLabel(/^TYPE$/i).selectOption("NOTICE");
    await page.getByRole("checkbox", { name: /^PIN NOTICE$/i }).check();
    await page.getByLabel(/^MESSAGE$/i).fill("집결 장소는 1층 로비입니다.");
    await page.getByRole("button", { name: /^POST NOTICE/i }).click();
    const notice = page
      .locator('.oa-talk-message[data-pinned="true"]')
      .filter({ hasText: "집결 장소는 1층 로비입니다." });
    await expect(notice).toContainText("PINNED NOTICE");
    await expect(page.locator(".oa-talk-message").first()).toContainText("집결 장소는 1층 로비입니다.");

    await useMockUser(page, "user-admin");
    await page.goto(`/program/${EXHIBITION_ID}?tab=talk`);
    await expect(page.getByText(/^ACTIVE$/i)).toBeVisible();
    await expect(page.getByLabel(/^TYPE$/i).locator('option[value="NOTICE"]')).toHaveCount(1);
  });

  test("HOST_COLLECT instructions are private and Host payment confirmation clears Member action", async ({
    page,
  }) => {
    await resetMock(page);

    await page.goto(`/program/${WORKSHOP_ID}`);
    const paymentInstructions = () =>
      page
        .getByRole("definition")
        .filter({ hasText: "참가 확정 후 호스트가 입금 정보를 안내합니다." });
    await expect(paymentInstructions()).toHaveCount(0);

    await joinProgram(page, WORKSHOP_ID);
    await page.goto(`/program/${WORKSHOP_ID}`);
    await expect(paymentInstructions()).toBeVisible();
    await page.goto(`/program/${WORKSHOP_ID}?tab=people`);
    await expect(page.getByText(/^PAID$/i)).toHaveCount(0);
    await expect(page.getByText(/^PENDING$/i)).toHaveCount(0);

    await page.goto("/");
    await expect(page.getByText(/^PAYMENT REQUIRED$/i)).toBeVisible();

    await useMockUser(page, "user-host-workshop");
    await page.goto(`/my/hosting/${WORKSHOP_ID}`);
    const currentMember = page.locator(".oa-host-participant").filter({ hasText: "오민서" });
    await expect(currentMember.getByText(/^PENDING$/i)).toBeVisible();
    await currentMember.getByRole("button", { name: /^MARK PAID$/i }).click();
    await expect(currentMember.getByText(/^PAID$/i)).toBeVisible();

    await useMockUser(page, "user-current");
    await page.goto("/");
    await expect(page.getByText(/^PAYMENT REQUIRED$/i)).toHaveCount(0);
  });

  test("Program cancellation preserves existing TALK but removes every composer", async ({ page }) => {
    await resetMock(page);
    await useMockUser(page, "user-host-exhibition");

    await page.goto(`/program/${EXHIBITION_ID}?tab=talk`);
    await page.getByLabel(/^TYPE$/i).selectOption("NOTICE");
    await page.getByLabel(/^MESSAGE$/i).fill("취소 전 참가자 안내 공지입니다.");
    await page.getByRole("button", { name: /^POST NOTICE/i }).click();
    await expect(page.getByText("취소 전 참가자 안내 공지입니다.", { exact: true })).toBeVisible();

    await page.goto(`/my/hosting/${EXHIBITION_ID}`);
    await page.getByRole("button", { name: /^CANCEL GATHERING/i }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^CANCEL GATHERING$/i })
      .click();
    await expect(page.getByText(/^CANCELLED$/i)).toBeVisible();

    await page.goto(`/program/${EXHIBITION_ID}?tab=talk`);
    await expect(page.getByText(/^READ ONLY$/i)).toBeVisible();
    await expect(page.getByText("취소 전 참가자 안내 공지입니다.", { exact: true })).toBeVisible();
    await expect(page.getByLabel(/^MESSAGE$/i)).toHaveCount(0);
    await page.goto(`/program/${EXHIBITION_ID}`);
    await expect(page.getByRole("button", { name: /^JOIN/i })).toHaveCount(0);
    await page.goto("/calendar?month=2026-08&scope=all&date=2026-08-22");
    const cancelledAgendaItem = page
      .getByRole("article")
      .filter({ hasText: "리움 전시 같이 보기" });
    await expect(cancelledAgendaItem.getByText(/CANCELLED/i)).toBeVisible();
    await page.goto("/");
    await expect(page.getByText(/^RECORD REQUIRED$/i)).toHaveCount(0);
  });

  test("a completed Program accepts a WHAT-only Record and clears RECORD REQUIRED", async ({
    page,
  }) => {
    await resetMock(page);
    await useMockUser(page, "user-admin");

    // Posting creates a persisted copy of the canonical fixture before this test
    // derives the supported COMPLETED-without-Record state.
    await page.goto(`/program/${TALK_ID}?tab=talk`);
    await page.getByLabel(/^MESSAGE$/i).fill("Record lifecycle fixture");
    await page.getByRole("button", { name: /^POST CHAT/i }).click();
    await expect(page.getByText("Record lifecycle fixture", { exact: true })).toBeVisible();
    await page.evaluate(
      ({ programId }) => {
        const storageKey = Object.keys(window.localStorage).find((key) =>
          key.startsWith("oa:mock-repository:"),
        );
        if (!storageKey) throw new Error("Mock repository storage key was not found");
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) throw new Error("Mock repository was not persisted");
        const state = JSON.parse(raw) as {
          revision: number;
          records: Array<{ id: string; programId: string }>;
          recordMaterials: Array<{ recordId: string }>;
        };
        const removedRecordIds = new Set(
          state.records.filter((record) => record.programId === programId).map((record) => record.id),
        );
        state.records = state.records.filter((record) => record.programId !== programId);
        state.recordMaterials = state.recordMaterials.filter(
          (material) => !removedRecordIds.has(material.recordId),
        );
        state.revision += 1;
        window.localStorage.setItem(storageKey, JSON.stringify(state));
      },
      { programId: TALK_ID },
    );

    await page.goto(`/program/${TALK_ID}?tab=record`);
    await expect(page.getByText(/^RECORD REQUIRED$/i).first()).toBeVisible();
    await page.getByLabel(/^WHAT$/i).fill("강연을 함께 듣고 핵심 관점을 기록했다.");
    await page.getByRole("button", { name: /^SAVE RECORD/i }).click();

    await expect(page.getByRole("status")).toContainText("Record가 저장되었습니다");
    await expect(
      page.getByText("강연을 함께 듣고 핵심 관점을 기록했다.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/^RECORD REQUIRED$/i)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /^FOUND$/i })).toHaveCount(0);
  });

  test("material DATE edits stay staged until Admin approval", async ({ page }) => {
    await resetMock(page);
    await useMockUser(page, "user-host-exhibition");
    await page.goto(`/gatherings/propose?edit=${EXHIBITION_ID}&mode=manage`);
    await expect(page.getByLabel(/^TITLE$/i)).toHaveValue("리움 전시 같이 보기");
    await page.getByRole("button", { name: /^NEXT$/i }).click();
    await page.getByLabel(/^DATE$/i).fill("2026-09-12");
    await advanceEditToPreview(page);
    await expect(page).toHaveURL(new RegExp(`/my\\?proposal=${EXHIBITION_ID}&status=pending$`));
    expect(await storedApprovalStatus(page, EXHIBITION_ID)).toBe("PENDING");

    await useMockUser(page, "user-current");
    await page.goto(`/program/${EXHIBITION_ID}`);
    await expect(page.getByText(/22 AUG 2026/i).first()).toBeVisible();
    await expect(page.getByText(/12 SEPT 2026/i)).toHaveCount(0);
    await page.goto("/programs?type=GATHERING");
    const publicItem = page.getByRole("article").filter({ hasText: "리움 전시 같이 보기" });
    await expect(publicItem.getByText(/22 AUG/i)).toBeVisible();
    await expect(publicItem.getByText(/12 SEPT/i)).toHaveCount(0);

    await useMockUser(page, "user-admin");
    await page.goto("/admin?view=approvals");
    await page.getByRole("link", { name: /리움 전시 같이 보기/ }).click();
    await expect(page.getByRole("definition").filter({ hasText: "12 SEPT 2026" })).toBeVisible();
    await page.getByRole("button", { name: /^APPROVE/i }).click();
    await expect(page.getByRole("status")).toContainText("APPROVED");

    await useMockUser(page, "user-current");
    await page.goto(`/program/${EXHIBITION_ID}`);
    await expect(page.getByText(/12 SEPT 2026/i).first()).toBeVisible();
    await expect(page.getByText(/22 AUG 2026/i)).toHaveCount(0);
  });

  test("operational MEETING POINT edits publish immediately without reopening approval", async ({
    page,
  }) => {
    await resetMock(page);
    await useMockUser(page, "user-host-exhibition");
    await page.goto(`/gatherings/propose?edit=${EXHIBITION_ID}&mode=manage`);
    await expect(page.getByLabel(/^TITLE$/i)).toHaveValue("리움 전시 같이 보기");
    await page.getByRole("button", { name: /^NEXT$/i }).click();
    await page.getByLabel(/^MEETING POINT$/i).fill("지상 1층 매표소 앞");
    await advanceEditToPreview(page);
    await expect(page).toHaveURL(new RegExp(`/my/hosting/${EXHIBITION_ID}\\?updated=1$`));
    expect(await storedApprovalStatus(page, EXHIBITION_ID)).toBe("APPROVED");

    await useMockUser(page, "user-current");
    await page.goto(`/program/${EXHIBITION_ID}`);
    await expect(page.getByText("지상 1층 매표소 앞", { exact: true })).toBeVisible();

    await useMockUser(page, "user-admin");
    await page.goto("/admin?view=approvals");
    await expect(page.getByRole("link", { name: /리움 전시 같이 보기/ })).toHaveCount(0);
  });

  test("Calendar exposes TODAY and downloaded ICS declares the Seoul timezone", async ({ page }) => {
    await resetMock(page);
    await page.goto("/calendar?month=2026-08&scope=all&date=2026-08-22");
    const today = page.getByRole("link", { name: /^TODAY$/i });
    await expect(today).toBeVisible();
    await expect(today).toHaveAttribute(
      "href",
      /^\/calendar\?month=\d{4}-\d{2}&scope=all&date=\d{4}-\d{2}-\d{2}$/,
    );

    await page.goto(`/program/${EXHIBITION_ID}`);
    await page.getByText("ADD TO CALENDAR", { exact: true }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /^DOWNLOAD \.ICS/i }).click();
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).not.toBeNull();
    const calendar = await readFile(path as string, "utf8");
    expect(calendar).toContain("X-WR-TIMEZONE:Asia/Seoul");
    expect(calendar).toContain("DTSTART:20260822T050000Z");
    expect(calendar).toContain("DTEND:20260822T080000Z");
  });
});
