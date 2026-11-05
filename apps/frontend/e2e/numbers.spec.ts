import { expect, test, type Page } from "@playwright/test";

/**
 * Màn quản lý đầu số — trang mặc định (mọi hash không khớp `#/flows/<id>`
 * và không phải `#/spike` ở dev, gồm `""`, `#/`, `#/numbers`, hash lạ).
 * Dữ liệu giả lập (id/số gõ cứng, xem `src/data/mock.ts`, không import):
 * một kịch bản `FLOW_MAIN` đang chạy ở đầu số `1900123456`; đầu số
 * `0283456789` chưa gán kịch bản. Quy ước DOM (`3-plan-05-…md`):
 *   nav-numbers         a[data-testid="nav-numbers"][href="#/numbers"]
 *   numbers-screen      [data-testid="numbers-screen"]
 *   number-row          [data-testid="number-row"][data-did-id]
 *                         (+ data-published-version-id chỉ khi khác null)
 *   number-value        [data-testid="number-value"]
 *   number-flow         [data-testid="number-flow"]
 *   number-create       button[data-testid="number-create"]
 *   number-dialog       dialog[data-testid="number-dialog"] (role="dialog")
 *   number-input        input[data-testid="number-input"]
 *   number-submit       button[type="submit"][data-testid="number-submit"]
 *   number-cancel       button[type="button"][data-testid="number-cancel"]
 *   number-create-error [data-testid="number-create-error"][role="alert"]
 */
const FLOW_MAIN_ID = "5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d401";
const FLOW_NAME = "Kịch bản chăm sóc khách hàng";
const DID_HOTLINE_ID = "5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d421";
const DID_FRESH_ID = "5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d422";

function listenErrors(page: Page, pageErrors: Error[], consoleErrors: string[]) {
  page.on("pageerror", (err) => pageErrors.push(err));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
}

async function openNumbers(page: Page) {
  await page.goto("/#/numbers");
  await expect(page.locator('[data-testid="numbers-screen"]')).toBeVisible();
  await expect(page.locator('[data-testid="number-row"]')).toHaveCount(2);
}

test.describe("numbers", () => {
  test("TC-PBX-008 — ít nhất một dòng hiện tên kịch bản đang chạy, dòng chưa gán hiện 'Chưa có kịch bản', không ô nào rỗng", async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];
    listenErrors(page, pageErrors, consoleErrors);

    await openNumbers(page);

    const hotlineRow = page.locator(`[data-testid="number-row"][data-did-id="${DID_HOTLINE_ID}"]`);
    await expect(hotlineRow).toHaveAttribute("data-published-version-id", /.+/);
    const hotlineFlow = hotlineRow.locator('[data-testid="number-flow"]');
    await expect(hotlineFlow).toHaveText(FLOW_NAME);
    await expect(hotlineFlow.locator(`a[href="#/flows/${FLOW_MAIN_ID}"]`)).toHaveCount(1);

    const freshRow = page.locator(`[data-testid="number-row"][data-did-id="${DID_FRESH_ID}"]`);
    expect(await freshRow.getAttribute("data-published-version-id")).toBeNull();
    await expect(freshRow.locator('[data-testid="number-flow"]')).toHaveText("Chưa có kịch bản");

    const flowCellTexts = await page.locator('[data-testid="number-flow"]').allTextContents();
    for (const text of flowCellTexts) {
      expect(text.trim()).not.toBe("");
    }

    expect(pageErrors, "0 sự kiện pageerror").toEqual([]);
    expect(consoleErrors, "0 console error").toEqual([]);
  });

  test("TC-PBX-010 — tạo đầu số qua modal: +1 dòng, số hiện ra; tải lại trang thì về gốc", async ({ page }) => {
    await openNumbers(page);
    const rows = page.locator('[data-testid="number-row"]');
    const countBefore = await rows.count();

    await page.locator('[data-testid="number-create"]').click();
    const dialog = page.locator('dialog[data-testid="number-dialog"]');
    await expect(dialog).toBeVisible();

    await page.locator('input[data-testid="number-input"]').fill("0912345678");
    await page.locator('button[data-testid="number-submit"]').click();

    await expect(dialog).toBeHidden();
    await expect(rows).toHaveCount(countBefore + 1);
    const newRow = page.locator('[data-testid="number-row"]').filter({
      has: page.locator('[data-testid="number-value"]', { hasText: "0912345678" }),
    });
    await expect(newRow.locator('[data-testid="number-value"]')).toHaveText("0912345678");
    await expect(newRow.locator('[data-testid="number-flow"]')).toHaveText("Chưa có kịch bản");

    await page.reload();
    await expect(page.locator('[data-testid="number-row"]')).toHaveCount(countBefore);
    const values = await page.locator('[data-testid="number-value"]').allTextContents();
    expect(values).not.toContain("0912345678");
  });

  test("bỏ trang mặc định: goto('/') vẫn hiện màn đầu số", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('[data-testid="numbers-screen"]')).toBeVisible();
  });

  test("liên kết: bấm link kịch bản mở trình dựng, bấm nav-numbers quay lại màn đầu số", async ({ page }) => {
    await openNumbers(page);
    const hotlineRow = page.locator(`[data-testid="number-row"][data-did-id="${DID_HOTLINE_ID}"]`);
    await hotlineRow.locator(`a[href="#/flows/${FLOW_MAIN_ID}"]`).click();
    await expect(page).toHaveURL(new RegExp(`#/flows/${FLOW_MAIN_ID}$`));
    await expect(page.locator(".react-flow__node")).toHaveCount(7);

    await page.locator('a[data-testid="nav-numbers"]').click();
    await expect(page.locator('[data-testid="numbers-screen"]')).toBeVisible();
  });

  test("huỷ bằng Escape: không thêm dòng; mở lại thì ô nhập và lỗi sạch", async ({ page }) => {
    await openNumbers(page);
    const rows = page.locator('[data-testid="number-row"]');
    const countBefore = await rows.count();

    await page.locator('[data-testid="number-create"]').click();
    await page.locator('input[data-testid="number-input"]').fill("0999999999");
    await page.keyboard.press("Escape");
    await expect(page.locator('dialog[data-testid="number-dialog"]')).toBeHidden();
    await expect(rows).toHaveCount(countBefore);

    await page.locator('[data-testid="number-create"]').click();
    await expect(page.locator('input[data-testid="number-input"]')).toHaveValue("");
    await expect(page.locator('[data-testid="number-create-error"]')).toHaveCount(0);
  });

  test("huỷ bằng number-cancel: không thêm dòng; mở lại thì ô nhập và lỗi sạch", async ({ page }) => {
    await openNumbers(page);
    const rows = page.locator('[data-testid="number-row"]');
    const countBefore = await rows.count();

    await page.locator('[data-testid="number-create"]').click();
    await page.locator('input[data-testid="number-input"]').fill("0999999998");
    await page.locator('button[data-testid="number-cancel"]').click();
    await expect(page.locator('dialog[data-testid="number-dialog"]')).toBeHidden();
    await expect(rows).toHaveCount(countBefore);

    await page.locator('[data-testid="number-create"]').click();
    await expect(page.locator('input[data-testid="number-input"]')).toHaveValue("");
    await expect(page.locator('[data-testid="number-create-error"]')).toHaveCount(0);
  });

  const invalidInputs: Array<[string, string]> = [
    ["   ", "toàn khoảng trắng"],
    ["1".repeat(33), "33 ký tự (vượt biên)"],
    ["1900123456", "trùng đầu số đã có"],
  ];
  for (const [value, label] of invalidInputs) {
    test(`lỗi nhập (${label}): hiện number-create-error, dialog vẫn mở, số dòng không đổi, không pageerror/console error`, async ({
      page,
    }) => {
      const pageErrors: Error[] = [];
      const consoleErrors: string[] = [];
      listenErrors(page, pageErrors, consoleErrors);

      await openNumbers(page);
      const rows = page.locator('[data-testid="number-row"]');
      const countBefore = await rows.count();

      await page.locator('[data-testid="number-create"]').click();
      await page.locator('input[data-testid="number-input"]').fill(value);
      await page.locator('button[data-testid="number-submit"]').click();

      const error = page.locator('[data-testid="number-create-error"][role="alert"]');
      await expect(error).toBeVisible();
      const text = ((await error.textContent()) ?? "").trim();
      expect(text).not.toBe("");
      await expect(page.locator('dialog[data-testid="number-dialog"]')).toBeVisible();
      await expect(rows).toHaveCount(countBefore);

      expect(pageErrors, "0 sự kiện pageerror").toEqual([]);
      expect(consoleErrors, "0 console error").toEqual([]);
    });
  }

  test("Enter trong ô nhập số xác nhận tạo đầu số: +1 dòng", async ({ page }) => {
    await openNumbers(page);
    const rows = page.locator('[data-testid="number-row"]');
    const countBefore = await rows.count();

    await page.locator('[data-testid="number-create"]').click();
    const input = page.locator('input[data-testid="number-input"]');
    await input.fill("0933333333");
    await input.press("Enter");

    await expect(page.locator('dialog[data-testid="number-dialog"]')).toBeHidden();
    await expect(rows).toHaveCount(countBefore + 1);
  });

  test("bấm đúp number-submit chỉ tạo đúng một đầu số, không hiện lỗi", async ({ page }) => {
    await openNumbers(page);
    const rows = page.locator('[data-testid="number-row"]');
    const countBefore = await rows.count();

    await page.locator('[data-testid="number-create"]').click();
    await page.locator('input[data-testid="number-input"]').fill("0944444444");
    await page.locator('button[data-testid="number-submit"]').dblclick();

    await expect(page.locator('dialog[data-testid="number-dialog"]')).toBeHidden();
    await expect(rows).toHaveCount(countBefore + 1);
    await expect(page.locator('[data-testid="number-create-error"]')).toHaveCount(0);
  });

  test("chuỗi có thẻ HTML được thoát ký tự đúng, không tạo phần tử con", async ({ page }) => {
    await openNumbers(page);
    await page.locator('[data-testid="number-create"]').click();
    await page.locator('input[data-testid="number-input"]').fill("<b>1</b>");
    await page.locator('button[data-testid="number-submit"]').click();
    await expect(page.locator('dialog[data-testid="number-dialog"]')).toBeHidden();

    const newRow = page.locator('[data-testid="number-row"]').filter({
      has: page.locator('[data-testid="number-value"]', { hasText: "<b>1</b>" }),
    });
    await expect(newRow.locator('[data-testid="number-value"]')).toHaveText("<b>1</b>");
    await expect(newRow.locator('[data-testid="number-value"] b')).toHaveCount(0);
  });
});
