import { expect, test } from "@playwright/test";

test.describe("development Design Lab", () => {
  test("renders production-connected specimens without horizontal overflow", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/design-lab");

    await expect(page.getByRole("heading", { name: /실제 화면의 기준을 한곳에서/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "02 / PROGRAM" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /GATHERING \/ WORKSHOP \/ OPEN/ }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "03 / TALK" })).toBeVisible();
    const reactionTrigger = page
      .getByRole("button", { name: /메시지에 반응 추가/ })
      .first();
    await reactionTrigger.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    await expect(reactionTrigger).toBeVisible();
    await reactionTrigger.click();
    const reactionPicker = page.getByRole("toolbar", { name: "메시지 반응 선택" });
    await expect(reactionPicker).toBeVisible();
    const pickerBox = await reactionPicker.boundingBox();
    expect(pickerBox).not.toBeNull();
    expect(pickerBox?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((pickerBox?.x ?? 0) + (pickerBox?.width ?? 0))
      .toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
    await expect(reactionPicker.getByRole("button").first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(reactionPicker).toBeHidden();

    const layout = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      offenders: Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .filter((element) => {
          const rectangle = element.getBoundingClientRect();
          return rectangle.right > document.documentElement.clientWidth + 1;
        })
        .slice(0, 12)
        .map((element) => ({
          className: element.className,
          tagName: element.tagName,
          text: element.textContent?.trim().slice(0, 80),
        })),
    }));
    expect(layout.documentWidth, JSON.stringify(layout.offenders, null, 2))
      .toBeLessThanOrEqual(layout.viewportWidth);
    expect(errors).toEqual([]);
  });
});
