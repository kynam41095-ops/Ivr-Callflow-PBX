import { expect, test, type Page } from "@playwright/test";

/**
 * Đường lỗi ép qua `?mockFail=<tên hàm>` (chỉ dev, `3-plan-05…md`). Ba màn
 * dùng chung `ErrorState`: `[role="alert"]` chứa `button[data-testid="retry"]`.
 * Id/số gõ cứng, xem `src/data/mock.ts` (không import).
 */
const FLOW_MAIN_ID = "5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d401";
const BASE_NODE_COUNT = 7;

function listenErrors(page: Page, pageErrors: Error[], consoleErrors: string[]) {
  page.on("pageerror", (err) => pageErrors.push(err));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
}

test.describe("error-states", () => {
  test("TC-FLOW-023 — cả ba màn hiện lỗi đọc được kèm retry; thử lại hồi phục thật; 0 pageerror/console error", async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];
    listenErrors(page, pageErrors, consoleErrors);

    // Màn đầu số.
    await page.goto("/?mockFail=listPhoneNumbers#/numbers");
    const numbersAlert = page.getByRole("alert");
    await expect(numbersAlert).toBeVisible();
    await expect(numbersAlert).toContainText("Không tải được");
    await expect(numbersAlert.locator('[data-testid="retry"]')).toBeVisible();
    await expect(page.locator('[data-testid="number-row"]')).toHaveCount(0);

    await page.evaluate(() => {
      history.replaceState(null, "", "/" + location.hash);
    });
    await numbersAlert.locator('[data-testid="retry"]').click();
    await expect(page.locator('[data-testid="number-row"]')).toHaveCount(2, { timeout: 3000 });
    await expect(page.getByRole("alert")).toHaveCount(0);

    // Trình dựng.
    await page.goto(`/?mockFail=getVersion#/flows/${FLOW_MAIN_ID}`);
    const builderAlert = page.getByRole("alert");
    await expect(builderAlert).toBeVisible();
    await expect(builderAlert.locator('[data-testid="retry"]')).toBeVisible();
    await expect(page.locator('[data-testid="builder-toolbar"]')).toBeVisible();

    await page.evaluate(() => {
      history.replaceState(null, "", "/" + location.hash);
    });
    await builderAlert.locator('[data-testid="retry"]').click();
    await expect(page.locator(".react-flow__node")).toHaveCount(BASE_NODE_COUNT, { timeout: 3000 });

    // Drawer.
    await page.goto(`/#/flows/${FLOW_MAIN_ID}`);
    await expect(page.locator(".react-flow__node")).toHaveCount(BASE_NODE_COUNT);
    await page.evaluate(() => {
      history.replaceState(null, "", "/?mockFail=listVersions" + location.hash);
    });
    await page.locator('button[data-testid="versions-open"]').click();
    const drawer = page.locator('aside[data-testid="versions-drawer"]');
    const drawerAlert = drawer.getByRole("alert");
    await expect(drawerAlert).toBeVisible();
    const drawerAlertText = ((await drawerAlert.textContent()) ?? "").trim();
    expect(drawerAlertText).not.toBe("");
    await expect(page.locator(".react-flow__node")).toHaveCount(BASE_NODE_COUNT);

    await page.evaluate(() => {
      history.replaceState(null, "", "/" + location.hash);
    });
    await drawerAlert.locator('[data-testid="retry"]').click();
    await expect(drawer.locator('li[data-testid="version-item"]')).toHaveCount(2, { timeout: 3000 });

    expect(pageErrors, "0 sự kiện pageerror").toEqual([]);
    expect(consoleErrors, "0 console error").toEqual([]);
  });

  test("mockFail=listVersions ngay lúc goto trình dựng cũng hiện alert + retry (tải trình dựng đi qua listVersions)", async ({
    page,
  }) => {
    await page.goto(`/?mockFail=listVersions#/flows/${FLOW_MAIN_ID}`);
    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert.locator('[data-testid="retry"]')).toBeVisible();
  });

  test("new-flow lỗi ở createFlow: hiện new-flow-error, hash không đổi, nút bật lại, canvas không đổi", async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];
    listenErrors(page, pageErrors, consoleErrors);

    await page.goto(`/?mockFail=createFlow#/flows/${FLOW_MAIN_ID}`);
    await expect(page.locator(".react-flow__node")).toHaveCount(BASE_NODE_COUNT);

    await page.locator('[data-testid="new-flow"]').click();
    const error = page.locator('[data-testid="new-flow-error"]');
    await expect(error).toBeVisible();
    const text = ((await error.textContent()) ?? "").trim();
    expect(text).not.toBe("");
    await expect(page).toHaveURL(new RegExp(`#/flows/${FLOW_MAIN_ID}$`));
    await expect(page.locator('[data-testid="new-flow"]')).toBeEnabled();
    await expect(page.locator(".react-flow__node")).toHaveCount(BASE_NODE_COUNT);

    expect(pageErrors, "0 sự kiện pageerror").toEqual([]);
    expect(consoleErrors, "0 console error").toEqual([]);
  });

  test("new-flow lỗi ở saveDraft (lời gọi thứ hai): hiện new-flow-error, hash không đổi, nút bật lại, canvas không đổi", async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];
    listenErrors(page, pageErrors, consoleErrors);

    await page.goto(`/?mockFail=saveDraft#/flows/${FLOW_MAIN_ID}`);
    await expect(page.locator(".react-flow__node")).toHaveCount(BASE_NODE_COUNT);

    await page.locator('[data-testid="new-flow"]').click();
    const error = page.locator('[data-testid="new-flow-error"]');
    await expect(error).toBeVisible();
    const text = ((await error.textContent()) ?? "").trim();
    expect(text).not.toBe("");
    await expect(page).toHaveURL(new RegExp(`#/flows/${FLOW_MAIN_ID}$`));
    await expect(page.locator('[data-testid="new-flow"]')).toBeEnabled();
    await expect(page.locator(".react-flow__node")).toHaveCount(BASE_NODE_COUNT);

    expect(pageErrors, "0 sự kiện pageerror").toEqual([]);
    expect(consoleErrors, "0 console error").toEqual([]);
  });

  test("mockFail không khớp tên hàm nào → vô hại, màn đầu số hiện đúng 2 dòng, 0 alert", async ({ page }) => {
    await page.goto("/?mockFail=khongCo#/numbers");
    await expect(page.locator('[data-testid="number-row"]')).toHaveCount(2);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("hash lạ đều rơi về màn đầu số, không pageerror", async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (err) => pageErrors.push(err));

    // Xen giữa mỗi hash lạ một lần điều hướng sang trình dựng: `goto` chỉ
    // đổi fragment dễ thành điều hướng same-document (trình duyệt không
    // reload), khiến numbers-screen "vẫn hiển thị" từ trạng thái cũ mà
    // không thật sự kiểm tra lại route cho hash mới. Xen builder ép DOM đổi
    // hẳn trước mỗi khẳng định.
    await page.goto("/#/khong-co");
    await expect(page.locator('[data-testid="numbers-screen"]')).toBeVisible();

    await page.goto(`/#/flows/${FLOW_MAIN_ID}`);
    await expect(page.locator(".react-flow__node")).toHaveCount(BASE_NODE_COUNT);

    await page.goto("/#/numbers/rac");
    await expect(page.locator('[data-testid="numbers-screen"]')).toBeVisible();

    await page.goto(`/#/flows/${FLOW_MAIN_ID}`);
    await expect(page.locator(".react-flow__node")).toHaveCount(BASE_NODE_COUNT);

    await page.goto("/#/flows/");
    await expect(page.locator('[data-testid="numbers-screen"]')).toBeVisible();

    expect(pageErrors, "0 sự kiện pageerror").toEqual([]);
  });

  test("bấm đúp retry (sau khi gỡ query) trên màn đầu số vẫn đúng 2 dòng, không lỗi", async ({ page }) => {
    await page.goto("/?mockFail=listPhoneNumbers#/numbers");
    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();

    await page.evaluate(() => {
      history.replaceState(null, "", "/" + location.hash);
    });
    await alert.locator('[data-testid="retry"]').dblclick();
    await expect(page.locator('[data-testid="number-row"]')).toHaveCount(2, { timeout: 3000 });
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("rời màn đầu số ngay khi đang tải: đổi hash sang trình dựng, không pageerror/console error", async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];
    listenErrors(page, pageErrors, consoleErrors);

    await page.goto("/#/numbers");
    await page.evaluate((flowId) => {
      window.location.hash = `#/flows/${flowId}`;
    }, FLOW_MAIN_ID);

    await expect(page.locator(".react-flow__node")).toHaveCount(BASE_NODE_COUNT);

    expect(pageErrors, "0 sự kiện pageerror").toEqual([]);
    expect(consoleErrors, "0 console error").toEqual([]);
  });
});
