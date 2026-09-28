import { expect, test } from "@playwright/test";

/**
 * TC-FLOW-025 — tải lại trang là về gốc: kho giả lập nằm trong bộ nhớ, mỗi
 * `page.reload()` nạp lại module → về trạng thái ban đầu. Đổi hash bằng
 * `history`/`location.hash` không tải lại nên vẫn giữ kho giữa các bước.
 * Id gõ cứng, xem `src/data/mock.ts` (không import).
 */
const FLOW_MAIN_ID = "5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d401";
const VERSION_MAIN_ARCHIVED = "5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d411";
const VERSION_MAIN_PUBLISHED = "5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d412";
const BASE_NODE_COUNT = 7;

test("TC-FLOW-025 — tạo đầu số + lưu bản nháp, tải lại trang → đầu số và phiên bản về đúng trạng thái gốc", async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto("/#/numbers");
  await expect(page.locator('[data-testid="number-row"]')).toHaveCount(2);
  const numberValues = page.locator('[data-testid="number-value"]');
  const valuesBefore = await numberValues.allTextContents();

  await page.locator('[data-testid="number-create"]').click();
  await page.locator('input[data-testid="number-input"]').fill("0934567890");
  await page.locator('button[data-testid="number-submit"]').click();
  await expect(page.locator('[data-testid="number-row"]')).toHaveCount(valuesBefore.length + 1);

  const hotlineRow = page.locator('[data-testid="number-row"]').filter({
    has: page.locator('[data-testid="number-value"]', { hasText: "1900123456" }),
  });
  await hotlineRow.locator("a").click();
  await expect(page).toHaveURL(new RegExp(`#/flows/${FLOW_MAIN_ID}$`));
  await expect(page.locator(".react-flow__node")).toHaveCount(BASE_NODE_COUNT);

  const item = page.locator('[data-testid="palette-item"][data-node-type="hangup"]');
  await item.dragTo(page.locator(".react-flow__pane"));
  await page.locator('[data-testid="save-draft"]').click();
  const status = page.locator('[data-testid="save-status"]');
  await expect(status).toHaveAttribute("data-state", "saved", { timeout: 3000 });
  await expect(status).toHaveAttribute("data-version-number", "3");

  await page.locator('button[data-testid="versions-open"]').click();
  await expect(page.locator('li[data-testid="version-item"]')).toHaveCount(3);

  await page.reload();
  await expect(page.locator(".react-flow__node")).toHaveCount(BASE_NODE_COUNT);
  await page.locator('button[data-testid="versions-open"]').click();
  const itemsAfterReload = page.locator('li[data-testid="version-item"]');
  await expect(itemsAfterReload).toHaveCount(2);
  const idsAfterReload = await itemsAfterReload.evaluateAll((els) =>
    els.map((el) => el.getAttribute("data-version-id")).sort(),
  );
  expect(idsAfterReload).toEqual([VERSION_MAIN_ARCHIVED, VERSION_MAIN_PUBLISHED].sort());
  const statuses = await itemsAfterReload.evaluateAll((els) => els.map((el) => el.getAttribute("data-status")).sort());
  expect(statuses).toEqual(["archived", "published"]);

  await page.locator('a[data-testid="nav-numbers"]').click();
  await expect(page.locator('[data-testid="number-row"]')).toHaveCount(valuesBefore.length);
  const valuesAfter = await page.locator('[data-testid="number-value"]').allTextContents();
  expect(valuesAfter.sort()).toEqual(valuesBefore.sort());
  expect(valuesAfter).not.toContain("0934567890");

  expect(pageErrors, "0 sự kiện pageerror").toEqual([]);
  expect(consoleErrors, "0 console error").toEqual([]);
});
