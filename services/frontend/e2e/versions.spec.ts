import { expect, test, type Page } from "@playwright/test";

/**
 * Drawer phiên bản, mở từ trình dựng của `FLOW_MAIN` (id gõ cứng, xem
 * `src/data/mock.ts`, không import): phiên bản mới nhất published có bảy
 * node; hai phiên bản có sẵn — một `published` (`VERSION_MAIN_PUBLISHED`),
 * một `archived` (`VERSION_MAIN_ARCHIVED`, tài liệu ba node
 * start/welcome/hangup). Quy ước DOM (`3-plan-05-…md`):
 *   versions-open    button[data-testid="versions-open"] trên builder-toolbar
 *   versions-drawer  aside[data-testid="versions-drawer"]
 *   versions-close   button[data-testid="versions-close"]
 *   version-item     li[data-testid="version-item"][data-status][data-version-id]
 *   version-restore  button[data-testid="version-restore"] (trong mỗi version-item)
 *   restore-error    [data-testid="restore-error"][role="alert"] (trong drawer)
 */
const FLOW_MAIN_ID = "5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d401";
const FLOW_NAME = "Kịch bản chăm sóc khách hàng";
const VERSION_MAIN_ARCHIVED = "5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d411";
const VERSION_MAIN_PUBLISHED = "5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d412";
const DID_HOTLINE_ID = "5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d421";
const BASE_NODE_COUNT = 7;
const ARCHIVED_NODE_COUNT = 3;

function listenErrors(page: Page, pageErrors: Error[], consoleErrors: string[]) {
  page.on("pageerror", (err) => pageErrors.push(err));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
}

async function openBuilder(page: Page) {
  await page.goto(`/#/flows/${FLOW_MAIN_ID}`);
  await expect(page.locator(".react-flow__node")).toHaveCount(BASE_NODE_COUNT);
}

async function openDrawer(page: Page) {
  await page.locator('button[data-testid="versions-open"]').click();
  const drawer = page.locator('aside[data-testid="versions-drawer"]');
  await expect(drawer).toBeVisible();
  return drawer;
}

test.describe("versions", () => {
  test("TC-FLOW-022 — khôi phục bản archived tạo đúng 1 bản draft mới; published giữ nguyên; đầu số vẫn trỏ đúng bản published", async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];
    listenErrors(page, pageErrors, consoleErrors);

    await openBuilder(page);
    const drawer = await openDrawer(page);

    const items = drawer.locator('li[data-testid="version-item"]');
    await expect(items).toHaveCount(2);
    const published = drawer.locator(`li[data-testid="version-item"][data-version-id="${VERSION_MAIN_PUBLISHED}"]`);
    await expect(published).toHaveAttribute("data-status", "published");
    const archived = drawer.locator(`li[data-testid="version-item"][data-version-id="${VERSION_MAIN_ARCHIVED}"]`);
    await expect(archived).toHaveAttribute("data-status", "archived");

    const idsBefore = new Set(await items.evaluateAll((els) => els.map((el) => el.getAttribute("data-version-id"))));

    await archived.locator('button[data-testid="version-restore"]').click();
    await expect(items).toHaveCount(3, { timeout: 3000 });

    const idsAfter = await items.evaluateAll((els) => els.map((el) => el.getAttribute("data-version-id")));
    const newIds = idsAfter.filter((id) => id !== null && !idsBefore.has(id));
    expect(newIds).toHaveLength(1);
    const newItem = drawer.locator(`li[data-testid="version-item"][data-version-id="${newIds[0]}"]`);
    await expect(newItem).toHaveAttribute("data-status", "draft");

    await expect(published).toHaveAttribute("data-status", "published");
    await expect(archived).toHaveAttribute("data-status", "archived");

    await expect(page.locator(".react-flow__node")).toHaveCount(ARCHIVED_NODE_COUNT);

    await page.locator('a[data-testid="nav-numbers"]').click();
    const hotlineRow = page.locator(`[data-testid="number-row"][data-did-id="${DID_HOTLINE_ID}"]`);
    await expect(hotlineRow).toHaveAttribute("data-published-version-id", VERSION_MAIN_PUBLISHED);
    await expect(hotlineRow.locator('[data-testid="number-flow"]')).toHaveText(FLOW_NAME);

    expect(pageErrors, "0 sự kiện pageerror").toEqual([]);
    expect(consoleErrors, "0 console error").toEqual([]);
  });

  test("bấm đúp version-restore trên bản archived chỉ tạo đúng 1 bản draft mới (+1)", async ({ page }) => {
    await openBuilder(page);
    const drawer = await openDrawer(page);
    const archived = drawer.locator(`li[data-testid="version-item"][data-version-id="${VERSION_MAIN_ARCHIVED}"]`);

    await archived.locator('button[data-testid="version-restore"]').dblclick();
    await expect(drawer.locator('li[data-testid="version-item"]')).toHaveCount(3, { timeout: 3000 });
  });

  // Hồi quy BLOCKING (review iter 10, VersionsDrawer.tsx:99 + BuilderScreen.tsx:341):
  // lưu và khôi phục dùng hai khoá độc lập → có thể chạy chồng nhau. Đóng
  // drawer giữa chừng khôi phục không được huỷ thao tác: nút lưu phải khoá
  // cho tới khi khôi phục xong, mở lại drawer vẫn thấy khoá, rồi canvas/danh
  // sách phải đúng bản mới và nút lưu mở khoá trở lại.
  test("đóng drawer giữa chừng khôi phục rồi mở lại: nút lưu và nút khôi phục đều khoá tới khi xong, danh sách và canvas đúng bản mới", async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];
    listenErrors(page, pageErrors, consoleErrors);

    await openBuilder(page);
    const drawer = await openDrawer(page);
    const published = drawer.locator(`li[data-testid="version-item"][data-version-id="${VERSION_MAIN_PUBLISHED}"]`);
    const archived = drawer.locator(`li[data-testid="version-item"][data-version-id="${VERSION_MAIN_ARCHIVED}"]`);
    const saveButton = page.locator('[data-testid="save-draft"]');

    await archived.locator('button[data-testid="version-restore"]').click();
    await page.locator('button[data-testid="versions-close"]').click();
    await expect(saveButton).toBeDisabled({ timeout: 300 });

    await openDrawer(page);
    await expect(published.locator('button[data-testid="version-restore"]')).toBeDisabled({ timeout: 300 });
    await expect(archived.locator('button[data-testid="version-restore"]')).toBeDisabled({ timeout: 300 });

    await expect(page.locator(".react-flow__node")).toHaveCount(ARCHIVED_NODE_COUNT, { timeout: 3000 });
    await expect(drawer.locator('li[data-testid="version-item"]')).toHaveCount(3);
    await expect(drawer.locator('li[data-testid="version-item"][data-status="draft"]')).toHaveCount(1);
    await expect(saveButton).toBeEnabled();

    expect(pageErrors, "0 sự kiện pageerror").toEqual([]);
    expect(consoleErrors, "0 console error").toEqual([]);
  });

  // Hồi quy BLOCKING (review iter 10) — ca A: khôi phục rồi lưu ngay. Nút lưu
  // phải khoá trong lúc khôi phục đang chạy; bấm ép (force) không được tạo
  // một bản lưu chứa nội dung canvas cũ (lệch với bản vừa khôi phục).
  test("khôi phục rồi lưu ngay: nút lưu khoá trong lúc khôi phục đang chạy, lưu sau khi khôi phục xong tạo đúng phiên bản kế tiếp", async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];
    listenErrors(page, pageErrors, consoleErrors);

    await openBuilder(page);
    const drawer = await openDrawer(page);
    const archived = drawer.locator(`li[data-testid="version-item"][data-version-id="${VERSION_MAIN_ARCHIVED}"]`);
    const saveButton = page.locator('[data-testid="save-draft"]');
    const saveStatus = page.locator('[data-testid="save-status"]');

    await archived.locator('button[data-testid="version-restore"]').click();
    await expect(saveButton).toBeDisabled({ timeout: 300 });

    await saveButton.click({ force: true });
    await expect(page.locator(".react-flow__node")).toHaveCount(ARCHIVED_NODE_COUNT, { timeout: 3000 });

    await page.waitForTimeout(1000);
    await expect(drawer.locator('li[data-testid="version-item"]')).toHaveCount(3);
    await expect(drawer.locator('li[data-testid="version-item"][data-status="draft"]')).toHaveCount(1);
    await expect(saveStatus).toHaveAttribute("data-state", "idle");

    await saveButton.click();
    await expect(saveStatus).toHaveAttribute("data-state", "saved", { timeout: 3000 });
    await expect(saveStatus).toHaveAttribute("data-version-number", "4");

    await page.locator('a[data-testid="nav-numbers"]').click();
    await page.evaluate((id) => {
      window.location.hash = `#/flows/${id}`;
    }, FLOW_MAIN_ID);
    await expect(page.locator(".react-flow__node")).toHaveCount(ARCHIVED_NODE_COUNT);

    expect(pageErrors, "0 sự kiện pageerror").toEqual([]);
    expect(consoleErrors, "0 console error").toEqual([]);
  });

  // Hồi quy BLOCKING (review iter 10) — ca B: lưu rồi khôi phục ngay. Nút
  // khôi phục phải khoá trong lúc lưu đang chạy; bấm ép (force) không được
  // tạo một bản khôi phục lệch (chen giữa lần lưu chưa xong).
  test("lưu rồi khôi phục ngay: nút khôi phục khoá trong lúc lưu đang chạy, khôi phục sau khi lưu xong tạo đúng phiên bản kế tiếp", async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];
    listenErrors(page, pageErrors, consoleErrors);

    await openBuilder(page);
    const drawer = await openDrawer(page);
    const published = drawer.locator(`li[data-testid="version-item"][data-version-id="${VERSION_MAIN_PUBLISHED}"]`);
    const archived = drawer.locator(`li[data-testid="version-item"][data-version-id="${VERSION_MAIN_ARCHIVED}"]`);
    const saveButton = page.locator('[data-testid="save-draft"]');
    const saveStatus = page.locator('[data-testid="save-status"]');

    await saveButton.click();
    await expect(saveStatus).toHaveAttribute("data-state", "saving");
    await expect(published.locator('button[data-testid="version-restore"]')).toBeDisabled({ timeout: 300 });
    await expect(archived.locator('button[data-testid="version-restore"]')).toBeDisabled({ timeout: 300 });

    await archived.locator('button[data-testid="version-restore"]').click({ force: true });

    await expect(saveStatus).toHaveAttribute("data-state", "saved", { timeout: 3000 });
    await expect(saveStatus).toHaveAttribute("data-version-number", "3");

    await page.waitForTimeout(1000);
    await expect(drawer.locator('li[data-testid="version-item"]')).toHaveCount(3);
    await expect(page.locator(".react-flow__node")).toHaveCount(BASE_NODE_COUNT);
    await expect(saveStatus).toHaveAttribute("data-state", "saved");

    await archived.locator('button[data-testid="version-restore"]').click();
    await expect(page.locator(".react-flow__node")).toHaveCount(ARCHIVED_NODE_COUNT, { timeout: 3000 });
    await expect(drawer.locator('li[data-testid="version-item"]')).toHaveCount(4);

    expect(pageErrors, "0 sự kiện pageerror").toEqual([]);
    expect(consoleErrors, "0 console error").toEqual([]);
  });

  // Hồi quy (review iter 10) — ca C: rời màn ngay sau khi bấm khôi phục.
  // Khoá phải chặn thao tác chồng chéo, không chặn việc khôi phục tự hoàn
  // tất: bản nháp vẫn phải vào kho dù người dùng đã rời màn.
  test("rời màn ngay sau khi bấm khôi phục: bản khôi phục vẫn vào kho, quay lại đúng bản mới", async ({ page }) => {
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];
    listenErrors(page, pageErrors, consoleErrors);

    await openBuilder(page);
    const drawer = await openDrawer(page);
    const archived = drawer.locator(`li[data-testid="version-item"][data-version-id="${VERSION_MAIN_ARCHIVED}"]`);

    await archived.locator('button[data-testid="version-restore"]').click();
    await page.locator('a[data-testid="nav-numbers"]').click();

    await page.waitForTimeout(1500);

    await page.evaluate((id) => {
      window.location.hash = `#/flows/${id}`;
    }, FLOW_MAIN_ID);
    await expect(page.locator(".react-flow__node")).toHaveCount(ARCHIVED_NODE_COUNT, { timeout: 3000 });

    const drawerAgain = await openDrawer(page);
    await expect(drawerAgain.locator('li[data-testid="version-item"]')).toHaveCount(3);

    expect(pageErrors, "0 sự kiện pageerror").toEqual([]);
    expect(consoleErrors, "0 console error").toEqual([]);
  });

  test("lưu nháp trên canvas làm mới danh sách trong drawer đang mở, không cần đóng mở lại", async ({ page }) => {
    await openBuilder(page);
    const drawer = await openDrawer(page);
    await expect(drawer.locator('li[data-testid="version-item"]')).toHaveCount(2);

    const item = page.locator('[data-testid="palette-item"][data-node-type="hangup"]');
    await item.dragTo(page.locator(".react-flow__pane"));
    await expect(page.locator(".react-flow__node")).toHaveCount(BASE_NODE_COUNT + 1);

    await page.locator('[data-testid="save-draft"]').click();
    await expect(page.locator('[data-testid="save-status"]')).toHaveAttribute("data-state", "saved", {
      timeout: 3000,
    });

    await expect(drawer.locator('li[data-testid="version-item"]')).toHaveCount(3);
  });

  test("bấm đúp versions-open chỉ mở đúng một drawer", async ({ page }) => {
    await openBuilder(page);
    await page.locator('button[data-testid="versions-open"]').dblclick();
    await expect(page.locator('aside[data-testid="versions-drawer"]')).toHaveCount(1);
  });

  test("lỗi khôi phục: mockFail=getVersion hiện restore-error trong drawer, danh sách giữ 2 mục; gỡ query rồi thử lại thành công", async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];
    listenErrors(page, pageErrors, consoleErrors);

    await openBuilder(page);
    const drawer = await openDrawer(page);
    await expect(drawer.locator('li[data-testid="version-item"]')).toHaveCount(2);

    await page.evaluate(() => {
      history.replaceState(null, "", "/?mockFail=getVersion" + location.hash);
    });

    const archived = drawer.locator(`li[data-testid="version-item"][data-version-id="${VERSION_MAIN_ARCHIVED}"]`);
    await archived.locator('button[data-testid="version-restore"]').click();

    const restoreError = drawer.locator('[data-testid="restore-error"][role="alert"]');
    await expect(restoreError).toBeVisible();
    const text = ((await restoreError.textContent()) ?? "").trim();
    expect(text).not.toBe("");
    await expect(drawer.locator('li[data-testid="version-item"]')).toHaveCount(2);
    await expect(archived.locator('button[data-testid="version-restore"]')).toBeEnabled();

    await page.evaluate(() => {
      history.replaceState(null, "", "/" + location.hash);
    });
    await archived.locator('button[data-testid="version-restore"]').click();
    await expect(drawer.locator('li[data-testid="version-item"]')).toHaveCount(3, { timeout: 3000 });

    expect(pageErrors, "0 sự kiện pageerror").toEqual([]);
    expect(consoleErrors, "0 console error").toEqual([]);
  });

  test("lỗi khôi phục: mockFail=saveDraft hiện restore-error trong drawer, danh sách giữ 2 mục; gỡ query rồi thử lại thành công", async ({
    page,
  }) => {
    await openBuilder(page);
    const drawer = await openDrawer(page);
    await expect(drawer.locator('li[data-testid="version-item"]')).toHaveCount(2);

    await page.evaluate(() => {
      history.replaceState(null, "", "/?mockFail=saveDraft" + location.hash);
    });

    const archived = drawer.locator(`li[data-testid="version-item"][data-version-id="${VERSION_MAIN_ARCHIVED}"]`);
    await archived.locator('button[data-testid="version-restore"]').click();

    const restoreError = drawer.locator('[data-testid="restore-error"][role="alert"]');
    await expect(restoreError).toBeVisible();
    await expect(drawer.locator('li[data-testid="version-item"]')).toHaveCount(2);

    await page.evaluate(() => {
      history.replaceState(null, "", "/" + location.hash);
    });
    await archived.locator('button[data-testid="version-restore"]').click();
    await expect(drawer.locator('li[data-testid="version-item"]')).toHaveCount(3, { timeout: 3000 });
  });

  // Hồi quy BLOCKING (review iter 9, VersionsDrawer.tsx:96): saveDraft và lần
  // tải lại danh sách dùng chung một catch. Khôi phục thành công nhưng
  // listVersions kế đó lỗi thì phải hiện retry (không phải restore-error) và
  // không cho bấm version-restore lại — bấm lại mới là nguồn tạo nháp trùng.
  test("mockFail=listVersions sau khi khôi phục thành công: hiện retry (không phải restore-error), ẩn version-restore để không tạo nháp trùng; gỡ query rồi retry riêng từng nơi thì phục hồi đúng", async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];
    listenErrors(page, pageErrors, consoleErrors);

    await openBuilder(page);
    const drawer = await openDrawer(page);
    const items = drawer.locator('li[data-testid="version-item"]');
    await expect(items).toHaveCount(2);

    const published = drawer.locator(`li[data-testid="version-item"][data-version-id="${VERSION_MAIN_PUBLISHED}"]`);
    const archived = drawer.locator(`li[data-testid="version-item"][data-version-id="${VERSION_MAIN_ARCHIVED}"]`);

    await page.evaluate(() => {
      history.replaceState(null, "", "/?mockFail=listVersions" + location.hash);
    });

    await archived.locator('button[data-testid="version-restore"]').click();

    // Trễ lưu 500 ms trước khi listVersions (mock) chạy và lỗi ra.
    const drawerAlert = drawer.getByRole("alert");
    await expect(drawerAlert.locator('[data-testid="retry"]')).toBeVisible({ timeout: 3000 });
    await expect(drawer.locator('[data-testid="restore-error"]')).toHaveCount(0);
    await expect(drawer.locator('button[data-testid="version-restore"]')).toHaveCount(0);
    const canvasAlert = page.getByRole("alert").filter({ hasText: "Không tải được kịch bản" });
    await expect(canvasAlert).toBeVisible();

    await page.evaluate(() => {
      history.replaceState(null, "", "/" + location.hash);
    });
    await drawerAlert.locator('[data-testid="retry"]').click();

    await expect(items).toHaveCount(3, { timeout: 3000 });
    await expect(drawer.locator('li[data-testid="version-item"][data-status="draft"]')).toHaveCount(1);
    await expect(published).toHaveAttribute("data-status", "published");
    await expect(archived).toHaveAttribute("data-status", "archived");

    await canvasAlert.locator('[data-testid="retry"]').click();
    await expect(page.locator(".react-flow__node")).toHaveCount(ARCHIVED_NODE_COUNT, { timeout: 3000 });
    await expect(items).toHaveCount(3);

    expect(pageErrors, "0 sự kiện pageerror").toEqual([]);
    expect(consoleErrors, "0 console error").toEqual([]);
  });
});
