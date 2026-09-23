import { expect, test, type Page } from "@playwright/test";

/**
 * Trình dựng mở kịch bản giả lập `FLOW_MAIN` (id gõ cứng, xem
 * `src/data/mock.ts`), phiên bản mới nhất published (`versionNumber` 2, bảy
 * node: start, schedule, menu, play-info, play-closed, queue, hangup). Quy
 * ước DOM theo `3-plan-04-…md` mục "Files that change":
 *   validate         button[data-testid="validate"]
 *   validate-result  [data-testid="validate-result"][data-valid="true|false"]
 *   validate-issue   [data-testid="validate-issue"][data-code][data-severity] — chỉ issue KHÔNG nodeId
 *   node-issue       [data-testid="node-issue"][data-severity][data-code] — bên trong .react-flow__node[data-id]
 */
const FLOW_MAIN_ID = "5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d401";
const FLOW_URL = `/#/flows/${FLOW_MAIN_ID}`;
const BASE_NODE_COUNT = 7;
const KNOWN_NODE_IDS = new Set(["start", "schedule", "menu", "play-info", "play-closed", "queue", "hangup"]);

async function openBuilder(page: Page) {
  await page.goto(FLOW_URL);
  await expect(page.locator(".react-flow__node")).toHaveCount(BASE_NODE_COUNT);
}

async function dragStepFromPalette(page: Page, type: string) {
  const item = page.locator(`[data-testid="palette-item"][data-node-type="${type}"]`);
  await item.dragTo(page.locator(".react-flow__pane"));
}

test.describe("builder-validate", () => {
  test("TC-FLOW-021 — lỗi mồ côi hiện ngay trong node sai, không phải một thông báo chung ở đầu trang", async ({
    page,
  }) => {
    await openBuilder(page);
    await dragStepFromPalette(page, "hangup");
    const nodesAfterDrop = page.locator(".react-flow__node");
    await expect(nodesAfterDrop).toHaveCount(BASE_NODE_COUNT + 1);

    const ids = await nodesAfterDrop.evaluateAll((els) => els.map((el) => el.getAttribute("data-id")));
    const newHangupId = ids.find((id) => id !== null && !KNOWN_NODE_IDS.has(id));
    expect(newHangupId, "node hangup mới phải có id khác mọi node có sẵn").toBeTruthy();

    await page.locator('[data-testid="validate"]').click();

    const newNode = page.locator(`.react-flow__node[data-id="${newHangupId}"]`);
    const orphanOnNew = newNode.locator('[data-testid="node-issue"][data-severity="error"][data-code="ORPHAN_NODE"]');
    await expect(orphanOnNew).toHaveCount(1);
    await expect(orphanOnNew).toBeVisible();

    // Bẫy đỏ sai lý do: node schedule mang dấu cảnh báo — phải lọc theo
    // data-severity="error", không đếm mọi node-issue (3-plan-04 mục Risks).
    for (const id of KNOWN_NODE_IDS) {
      const node = page.locator(`.react-flow__node[data-id="${id}"]`);
      await expect(node.locator('[data-testid="node-issue"][data-severity="error"]')).toHaveCount(0);
    }

    await expect(page.locator('[data-testid="validate-result"]')).toHaveAttribute("data-valid", "false");
    await expect(
      page.locator('[data-testid="validate-result"] [data-testid="validate-issue"][data-code="ORPHAN_NODE"]'),
    ).toHaveCount(0);
  });

  test("TC-FLOW-024 — kịch bản mới chỉ có node Bắt đầu; kiểm hợp lệ báo hai nhánh treo, không sập, không nhân đôi khi bấm lại", async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (err) => pageErrors.push(err));

    await openBuilder(page);
    await page.locator('[data-testid="new-flow"]').click();

    await expect(page.locator(".react-flow__node")).toHaveCount(1, { timeout: 3000 });
    await expect(page.locator(".react-flow__node-start")).toHaveCount(1);
    expect(page.url()).not.toContain(FLOW_MAIN_ID);
    expect(page.url()).toMatch(/#\/flows\/[^/]+$/);

    await page.locator('[data-testid="validate"]').click();
    const startNode = page.locator(".react-flow__node-start");
    const dangling = startNode.locator('[data-testid="node-issue"][data-severity="error"][data-code="DANGLING_BRANCH"]');
    await expect(dangling).toHaveCount(2);
    await expect(page.locator('[data-testid="validate-result"]')).toHaveAttribute("data-valid", "false");

    await page.locator('[data-testid="validate"]').click();
    await expect(dangling).toHaveCount(2);

    expect(pageErrors, "0 sự kiện pageerror").toEqual([]);
  });

  test("TC-FLOW-027 (phần e2e) — node Điều kiện theo lịch mang dấu cảnh báo, không phải lỗi; kịch bản vẫn hợp lệ", async ({
    page,
  }) => {
    await openBuilder(page);
    await page.locator('[data-testid="validate"]').click();

    const scheduleNode = page.locator('[data-id="schedule"]');
    const warning = scheduleNode.locator(
      '[data-testid="node-issue"][data-severity="warning"][data-code="SCHEDULE_NOT_PUBLISHABLE"]',
    );
    await expect(warning).toHaveCount(1);

    await expect(page.locator('[data-testid="node-issue"][data-severity="error"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="validate-issue"][data-severity="error"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="validate-result"]')).toHaveAttribute("data-valid", "true");
  });

  test("gom lớp 1 trên giao diện: node play mới thiếu trường sinh đúng 1 INVALID_SHAPE và đúng 1 ORPHAN_NODE", async ({
    page,
  }) => {
    await openBuilder(page);
    await dragStepFromPalette(page, "play");
    const nodesAfterDrop = page.locator(".react-flow__node");
    await expect(nodesAfterDrop).toHaveCount(BASE_NODE_COUNT + 1);

    const ids = await nodesAfterDrop.evaluateAll((els) => els.map((el) => el.getAttribute("data-id")));
    const newPlayId = ids.find((id) => id !== null && !KNOWN_NODE_IDS.has(id));
    expect(newPlayId, "node play mới phải có id khác mọi node có sẵn").toBeTruthy();

    await page.locator('[data-testid="validate"]').click();

    const newNode = page.locator(`.react-flow__node[data-id="${newPlayId}"]`);
    const shapeIssue = newNode.locator('[data-testid="node-issue"][data-code="INVALID_SHAPE"]');
    await expect(shapeIssue).toHaveCount(1);
    const text = (await shapeIssue.textContent()) ?? "";
    expect(text).toContain("mediaId");
    await expect(newNode.locator('[data-testid="node-issue"][data-code="ORPHAN_NODE"]')).toHaveCount(1);

    await expect(page.locator('[data-testid="validate-result"]')).toHaveAttribute("data-valid", "false");
  });

  test("không còn node Bắt đầu: xoá node start bằng Backspace, kiểm hợp lệ báo INVALID_START không gắn node, không sập", async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await openBuilder(page);
    await page.locator('.react-flow__node[data-id="start"]').click();
    await page.keyboard.press("Backspace");
    await expect(page.locator(".react-flow__node")).toHaveCount(BASE_NODE_COUNT - 1);

    await page.locator('[data-testid="validate"]').click();
    await expect(page.locator('[data-testid="validate-result"]')).toHaveAttribute("data-valid", "false");
    await expect(
      page.locator('[data-testid="validate-result"] [data-testid="validate-issue"][data-code="INVALID_START"]'),
    ).toHaveCount(1);

    expect(pageErrors, "0 sự kiện pageerror").toEqual([]);
    expect(consoleErrors, "0 console error").toEqual([]);
  });
});
