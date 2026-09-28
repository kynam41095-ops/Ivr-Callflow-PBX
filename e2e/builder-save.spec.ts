import { expect, test, type Page } from "@playwright/test";

/**
 * Trình dựng mở kịch bản giả lập `FLOW_MAIN` (id gõ cứng, xem
 * `src/data/mock.ts`), phiên bản mới nhất published (`versionNumber` 2, bảy
 * node). Quy ước DOM theo `3-plan-04-…md` mục "Files that change":
 *   save-draft         button[data-testid="save-draft"]
 *   save-status        [data-testid="save-status"][data-state="idle|saving|saved|error"]
 *                       saved → thêm data-version-number; error → thêm role="alert"
 * Mỗi test Playwright mở trang mới → kho giả lập nạp lại → bản nháp đầu
 * tiên của FLOW_MAIN luôn là versionNumber 3 (bản published có sẵn là 2).
 */
const FLOW_MAIN_ID = "5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d401";
const FLOW_URL = `/#/flows/${FLOW_MAIN_ID}`;
const BASE_NODE_COUNT = 7;

async function openBuilder(page: Page) {
  await page.goto(FLOW_URL);
  await expect(page.locator(".react-flow__node")).toHaveCount(BASE_NODE_COUNT);
}

async function dragStepFromPalette(page: Page, type: string) {
  const item = page.locator(`[data-testid="palette-item"][data-node-type="${type}"]`);
  await item.dragTo(page.locator(".react-flow__pane"));
}

test.describe("builder-save", () => {
  test("TC-FLOW-020 — bấm lưu nháp hiện trạng thái đang lưu trước, rồi mới hiện đã lưu", async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (err) => pageErrors.push(err));

    await openBuilder(page);
    // Thả hangup (không phải play): lớp 1 vẫn hợp lệ, saveDraft chỉ chặn khi
    // tài liệu sai định dạng — xem 3-plan-04 mục Risks.
    await dragStepFromPalette(page, "hangup");
    await expect(page.locator(".react-flow__node")).toHaveCount(BASE_NODE_COUNT + 1);

    const saveButton = page.locator('[data-testid="save-draft"]');
    const status = page.locator('[data-testid="save-status"]');

    await saveButton.click();
    await expect(status).toHaveAttribute("data-state", "saving");
    await expect(saveButton).toBeDisabled();

    await expect(status).toHaveAttribute("data-state", "saved", { timeout: 3000 });
    await expect(status).toHaveAttribute("data-version-number", "3");

    expect(pageErrors, "0 sự kiện pageerror").toEqual([]);
  });

  test("bấm đúp lưu nháp chỉ tạo đúng một phiên bản; bấm tiếp một lần tạo phiên bản kế", async ({ page }) => {
    await openBuilder(page);
    const saveButton = page.locator('[data-testid="save-draft"]');
    const status = page.locator('[data-testid="save-status"]');

    await saveButton.dblclick();
    await expect(status).toHaveAttribute("data-state", "saved", { timeout: 3000 });
    await expect(status).toHaveAttribute("data-version-number", "3");

    await saveButton.click();
    await expect(status).toHaveAttribute("data-state", "saved", { timeout: 3000 });
    await expect(status).toHaveAttribute("data-version-number", "4");
  });

  test("lưu bị từ chối: tài liệu lớp 1 đỏ hiện trạng thái lỗi đọc được, nút bật lại, không pageerror/console error", async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await openBuilder(page);
    // Thả play: mặc định chưa chọn mediaId/nối nhánh → lớp 1 đỏ thật, không
    // cần ?mockFail.
    await dragStepFromPalette(page, "play");
    await expect(page.locator(".react-flow__node")).toHaveCount(BASE_NODE_COUNT + 1);

    const saveButton = page.locator('[data-testid="save-draft"]');
    const status = page.locator('[data-testid="save-status"]');

    await saveButton.click();
    await expect(status).toHaveAttribute("data-state", "saving");
    await expect(status).toHaveAttribute("data-state", "error", { timeout: 3000 });
    await expect(status).toHaveAttribute("role", "alert");
    const text = ((await status.textContent()) ?? "").trim();
    expect(text).not.toBe("");
    expect(await status.getAttribute("data-version-number")).toBeNull();
    await expect(saveButton).toBeEnabled();

    expect(pageErrors, "0 sự kiện pageerror").toEqual([]);
    expect(consoleErrors, "0 console error").toEqual([]);
  });

  test("rời trình dựng khi đang lưu: bản nháp vẫn vào kho, quay lại thấy đủ node", async ({ page }) => {
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await openBuilder(page);
    await dragStepFromPalette(page, "hangup");
    await expect(page.locator(".react-flow__node")).toHaveCount(BASE_NODE_COUNT + 1);

    await page.locator('[data-testid="save-draft"]').click();
    // Rời ngay khi trễ lưu (500 ms) còn đang chạy.
    await page.evaluate(() => {
      window.location.hash = "#/";
    });
    // Trễ lưu là 500 ms; quay lại sớm thì màn mount lại với bản cũ và không
    // tự cập nhật — 1500 ms đủ để bản nháp vào kho trước khi quay lại.
    await page.waitForTimeout(1500);
    await page.evaluate((url) => {
      window.location.hash = url;
    }, `#/flows/${FLOW_MAIN_ID}`);

    await expect(page.locator(".react-flow__node")).toHaveCount(BASE_NODE_COUNT + 1);

    expect(pageErrors, "0 sự kiện pageerror").toEqual([]);
    expect(consoleErrors, "0 console error").toEqual([]);
  });
});
