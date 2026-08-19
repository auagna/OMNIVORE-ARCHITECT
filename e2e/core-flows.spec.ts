import { expect, type Locator, type Page, test } from "@playwright/test";

const runtimeErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
});

test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page) ?? [], "browser runtime errors").toEqual([]);
});

async function actionNamed(page: Page, name: RegExp): Promise<Locator> {
  return page
    .getByRole("button", { name })
    .or(page.getByRole("link", { name }))
    .first();
}

async function chooseControl(
  page: Page,
  label: RegExp,
  optionName: RegExp,
  optionValue: string,
): Promise<void> {
  const select = page.getByLabel(label);

  if ((await select.count()) > 0 && (await select.first().evaluate((node) => node.tagName)) === "SELECT") {
    await select.first().selectOption(optionValue);
    return;
  }

  const radio = page.getByRole("radio", { name: optionName });
  if ((await radio.count()) > 0) {
    await radio.first().check();
    return;
  }

  await page.getByRole("button", { name: optionName }).first().click();
}

async function resetMock(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
}

async function advanceToCost(
  page: Page,
  options: { title?: string; categoryName?: RegExp; categoryValue?: string } = {},
): Promise<void> {
  const title = options.title ?? "한강 건축 산책";
  const categoryName = options.categoryName ?? /^FIELD[ _]TRIP$/i;
  const categoryValue = options.categoryValue ?? "FIELD_TRIP";
  await page.getByLabel(/^TITLE/i).fill(title);
  await chooseControl(page, /^CATEGORY/i, categoryName, categoryValue);
  await (await actionNamed(page, /^NEXT$/i)).click();

  await page.getByLabel(/^DATE/i).fill("2026-08-29");
  await page.getByLabel(/^START TIME/i).fill("14:00");
  await page.getByLabel(/^PLACE/i).fill("뚝섬한강공원");
  await (await actionNamed(page, /^NEXT$/i)).click();

  await page.getByLabel(/^CAPACITY/i).fill("8");
  await (await actionNamed(page, /^NEXT$/i)).click();
}

test.describe("Phase 1–3 critical journeys", () => {
  test("HOME → Gathering Detail → JOIN → MY Upcoming", async ({ page }) => {
    await resetMock(page);

    await expect(page.getByText("OMNIVORE", { exact: false }).first()).toBeVisible();

    await page
      .getByRole("link", { name: /리움 전시 같이 보기/ })
      .first()
      .click();

    await expect(page).toHaveURL(/\/program\/program-gathering-028$/);
    await expect(page.getByRole("heading", { name: /리움 전시 같이 보기/ })).toBeVisible();
    await expect(page.getByText("리움미술관", { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/06\s*\/\s*08/).first()).toBeVisible();
    await expect(page.getByText("TICKET", { exact: true })).toBeVisible();
    await expect(page.getByText("COST", { exact: true })).toHaveCount(0);

    const join = await actionNamed(page, /^JOIN(?:\s+GATHERING)?(?:\s*→)?$/i);
    await expect(join).toBeVisible();
    await join.click();

    const confirmJoin = page.getByRole("button", { name: /^CONFIRM JOIN$/i });
    await expect(confirmJoin).toBeVisible();
    await confirmJoin.click();

    await expect(page).toHaveURL(/\/my\?joined=/);
    await expect(page.getByRole("heading", { name: /^MY$/i })).toBeVisible();
    await expect(page.getByText(/^UPCOMING$/i)).toBeVisible();
    await expect(page.getByText("리움 전시 같이 보기", { exact: true })).toBeVisible();
  });

  test("PROPOSE → New Gathering → Preview → Submit → MY Pending", async ({
    page,
  }) => {
    await resetMock(page);

    const primaryNavigation = page.getByRole("navigation", {
      name: "Primary navigation",
    });
    await primaryNavigation
      .getByRole("link", { name: /^PROPOSE(?: GATHERING)?$/i })
      .click();

    await expect(page.getByRole("heading", { name: /PROPOSE A\s+GATHERING/i })).toBeVisible();

    await advanceToCost(page, {
      title: "작은 재료 오브젝트 만들기",
      categoryName: /^WORKSHOP$/i,
      categoryValue: "WORKSHOP",
    });
    await chooseControl(page, /^(?:COST|COST TYPE)/i, /^HOST[ _]COLLECT$/i, "HOST_COLLECT");
    await page.getByLabel(/^PARTICIPATION FEE/i).fill("25000");
    await page.getByLabel(/^PAYMENT INFO/i).fill("신한 000-000-000000 오민서");
    await (await actionNamed(page, /^NEXT$/i)).click();
    await page
      .getByLabel(/^DESCRIPTION/i)
      .fill("한강 주변의 공공 공간과 건축을 함께 걷습니다.");

    await (await actionNamed(page, /^PREVIEW(?:\s*→)?$/i)).click();

    await expect(page.getByText("작은 재료 오브젝트 만들기", { exact: true })).toBeVisible();
    await expect(page.getByText(/GATHERING\s*\/\s*WORKSHOP/i)).toBeVisible();
    await expect(page.getByText(/29\s+AUG\s+2026/)).toBeVisible();
    await expect(page.getByText(/25,000 KRW\s*·\s*HOST COLLECT/i)).toBeVisible();

    const submit = await actionNamed(page, /^SUBMIT FOR APPROVAL(?:\s*→)?$/i);
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page).toHaveURL(/\/my\?proposal=.*&status=pending$/);
    await expect(page.getByRole("heading", { name: /^MY$/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "작은 재료 오브젝트 만들기" })).toBeVisible();
    await expect(page.getByText(/^PENDING$/i).first()).toBeVisible();
    await expect(page.getByText(/승인 전까지 공개 Program에는 표시되지 않습니다/)).toBeVisible();
  });

  test("Gathering cost fields follow the selected cost policy", async ({ page }) => {
    await resetMock(page);

    const primaryNavigation = page.getByRole("navigation", {
      name: "Primary navigation",
    });
    await primaryNavigation
      .getByRole("link", { name: /^PROPOSE(?: GATHERING)?$/i })
      .click();

    await advanceToCost(page);
    await chooseControl(page, /^(?:COST|COST TYPE)/i, /^FREE$/i, "FREE");
    await expect(page.getByLabel(/^ESTIMATED PRICE/i)).toHaveCount(0);
    await expect(page.getByLabel(/^PARTICIPATION FEE/i)).toHaveCount(0);
    await expect(page.getByLabel(/^PAYMENT INFO/i)).toHaveCount(0);

    await chooseControl(
      page,
      /^(?:COST|COST TYPE)/i,
      /^INDIVIDUAL[ _]PURCHASE$/i,
      "INDIVIDUAL_PURCHASE",
    );
    await expect(page.getByLabel(/^ESTIMATED PRICE/i)).toBeVisible();
    await expect(page.getByLabel(/^PURCHASE URL/i)).toBeVisible();
    await expect(page.getByLabel(/^PURCHASE NOTE/i)).toBeVisible();
    await expect(page.getByLabel(/^PAYMENT INFO/i)).toHaveCount(0);

    await chooseControl(
      page,
      /^(?:COST|COST TYPE)/i,
      /^HOST[ _]COLLECT$/i,
      "HOST_COLLECT",
    );
    await expect(page.getByLabel(/^PARTICIPATION FEE/i)).toBeVisible();
    await expect(page.getByLabel(/^FEE INCLUDES/i)).toBeVisible();
    await expect(page.getByLabel(/^PAYMENT INFO/i)).toBeVisible();
    await expect(page.getByLabel(/^PAYMENT DEADLINE/i)).toBeVisible();
    await expect(page.getByLabel(/^CANCELLATION POLICY/i)).toBeVisible();
    await expect(page.getByLabel(/^PURCHASE URL/i)).toHaveCount(0);
  });

  test("Create moves focus to the first invalid field", async ({ page }) => {
    await resetMock(page);

    const primaryNavigation = page.getByRole("navigation", {
      name: "Primary navigation",
    });
    await primaryNavigation
      .getByRole("link", { name: /^PROPOSE(?: GATHERING)?$/i })
      .click();

    await (await actionNamed(page, /^NEXT$/i)).click();
    await expect(page.getByLabel(/^TITLE/i)).toBeFocused();
    await expect(page.getByText("제목을 입력해 주세요.", { exact: true })).toBeVisible();
  });
});
