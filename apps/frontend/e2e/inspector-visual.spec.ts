import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Lô 11 — AC-42 (TC-FLOW-036), AC-43 (TC-CALL-025).
 *
 * Dùng lại kịch bản FLOW_MAIN (id gõ cứng, cùng bộ dùng ở
 * `builder-inspector.spec.ts` / `canvas-visual.spec.ts` / `chrome-visual.spec.ts`):
 * 7 node — start, schedule, menu, play-info, play-closed, queue, hangup.
 * menu.timeoutSeconds = 5 (node-summary "Lời nhắc menu chính · chờ 5s",
 * xem canvas-visual.spec.ts EXPECTED_SUMMARY_BY_ID). menu có phím 1, 2 nối
 * tới node khác (TC-CALL-018 / builder-canvas.spec.ts: handleIds
 * choice-1, choice-2, invalid, timeout). schedule có 2 khung
 * (builder-inspector.spec.ts: rules count 2, rule 1 weekday 1→5).
 *
 * "bằng --x" = giá trị đã tính của phần tử dò mang `<prop>: var(--x)`,
 * không so chuỗi thô (Quy ước chung AC-27…AC-37, lot-brief dòng 30).
 * Quy ước data-testid theo mục "Quy ước chung test ↔ code" của lô 11.
 */

const FLOW_URL = "/#/flows/5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d401";
const EXPECTED_NODE_COUNT = 7;

async function openBuilder(page: Page) {
  await page.goto(FLOW_URL);
  await expect(page.locator(".react-flow__node")).toHaveCount(EXPECTED_NODE_COUNT);
}

/** Bỏ chọn node hiện tại trước khi chọn node kế (Quy ước lô 9). */
async function deselectNode(page: Page): Promise<void> {
  await page.locator(".react-flow__pane").click({ position: { x: 5, y: 5 } });
}

async function selectNode(page: Page, nodeId: string): Promise<Locator> {
  await deselectNode(page);
  await page.locator(`[data-id="${nodeId}"]`).click();
  const inspector = page.locator('[data-testid="inspector"]');
  await expect(inspector).toBeVisible();
  return inspector;
}

async function layoutSize(el: Locator): Promise<{ width: number; height: number }> {
  return el.evaluate((e) => {
    const cs = getComputedStyle(e);
    return { width: parseFloat(cs.width), height: parseFloat(cs.height) };
  });
}

/** Giá trị CSS đã tính của một phần tử dò tạm mang `<prop>: var(<varName>)`. */
async function resolvedVar(page: Page, cssProp: string, varName: string): Promise<string> {
  return page.evaluate(
    ({ cssProp, varName }) => {
      const probe = document.createElement("div");
      probe.style.setProperty(cssProp, `var(${varName})`);
      document.body.appendChild(probe);
      const value = getComputedStyle(probe).getPropertyValue(cssProp);
      probe.remove();
      return value;
    },
    { cssProp, varName },
  );
}

const test6 = test.extend<{ _captureConsoleErrors: void }>({
  _captureConsoleErrors: [
    async ({ page }, use) => {
      const pageErrors: Error[] = [];
      const consoleErrors: string[] = [];
      // Chỉ thu để in ra đối chiếu thủ công (Rủi ro lô 11: đổi phím ghi cạnh
      // và `data` cùng lượt — nghi `error008` của React Flow nếu thiếu
      // `updateNodeInternals`). Không `expect` — mẫu lọc theo
      // `builder-canvas.spec.ts:270,283`.
      const suspiciousWarnings: string[] = [];
      page.on("pageerror", (err) => pageErrors.push(err));
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
        if (msg.type() === "warning" && /react|xyflow/i.test(msg.text())) {
          suspiciousWarnings.push(msg.text());
        }
      });
      await use();
      expect(pageErrors, "0 sự kiện pageerror").toEqual([]);
      expect(consoleErrors, "0 console error").toEqual([]);
      if (suspiciousWarnings.length > 0) {
        console.log(
          "[inspector-visual] console warning react/xyflow (chỉ ghi nhận, không assert):",
          suspiciousWarnings,
        );
      } else {
        console.log("[inspector-visual] 0 console warning react/xyflow");
      }
    },
    { auto: true },
  ],
});

test6.describe("inspector-visual", () => {
  test6.use({ viewport: { width: 1440, height: 900 } });

  test6(
    "TC-FLOW-036 — khung inspector rộng 360px, đầu khung, ô tên, nhãn trường, thanh trượt Menu, thẻ khung giờ Điều kiện theo lịch, đóng bằng ›",
    async ({ page }) => {
      await openBuilder(page);

      const ALL_TYPES: Array<{ id: string }> = [
        { id: "start" },
        { id: "play-info" },
        { id: "menu" },
        { id: "queue" },
        { id: "hangup" },
        { id: "schedule" },
      ];

      for (const { id } of ALL_TYPES) {
        const inspector = await selectNode(page, id);

        const size = await layoutSize(inspector);
        expect(Math.round(size.width), `inspector rộng 360px cho node ${id}`).toBe(360);

        await expect(inspector.locator('[data-testid="inspector-title"]')).toHaveText("Cấu hình node");
        const closeBtn = inspector.locator('[data-testid="inspector-close"]');
        await expect(closeBtn).toHaveText("›");
        expect(await inspector.locator("h2").count(), `node ${id} không có h2`).toBe(0);

        const nameInput = inspector.locator('input[data-field="label"]');
        await expect(nameInput).toHaveAttribute("aria-label", "Tên bước");
        const nameSize = await layoutSize(nameInput);
        expect(Math.round(nameSize.height), `ô tên cao 44px cho node ${id}`).toBe(44);
        const nameStyle = await nameInput.evaluate((el) => {
          const cs = getComputedStyle(el);
          return { fontSize: parseFloat(cs.fontSize), fontWeight: Number(cs.fontWeight) };
        });
        expect(Math.round(nameStyle.fontSize), `ô tên chữ 16px cho node ${id}`).toBe(16);
        expect(nameStyle.fontWeight, `ô tên đậm ít nhất 600 cho node ${id}`).toBeGreaterThanOrEqual(600);

        const codeEl = inspector.locator('[data-testid="inspector-code"]');
        const typeEl = inspector.locator('[data-testid="inspector-type"]');
        const nodeIdEl = inspector.locator('[data-testid="inspector-node-id"]');
        await expect(codeEl).toBeVisible();
        await expect(typeEl).toBeVisible();
        await expect(nodeIdEl).toBeVisible();
        // Đo đủ Then (AC-42): cạnh trên inspector-code nằm dưới cạnh dưới
        // ô tên, không chỉ kiểm hiện diện.
        const codeBox = await codeEl.boundingBox();
        const nameBoxForCode = await nameInput.boundingBox();
        if (!codeBox || !nameBoxForCode) {
          throw new Error(`không lấy được boundingBox của inspector-code/ô tên cho node ${id}`);
        }
        expect(
          codeBox.y,
          `inspector-code nằm dưới ô tên cho node ${id}`,
        ).toBeGreaterThanOrEqual(nameBoxForCode.y + nameBoxForCode.height);

        // Nhãn trường chữ hoa 11px — trừ hai nhãn thanh trượt của Menu
        // (testid khác: inspector-range-label, không nằm trong lựa chọn này).
        const labels = inspector.locator('[data-testid="inspector-label"]');
        const labelCount = await labels.count();
        for (let i = 0; i < labelCount; i += 1) {
          const label = labels.nth(i);
          if (!(await label.isVisible())) continue;
          const style = await label.evaluate((el) => {
            const cs = getComputedStyle(el);
            return { textTransform: cs.textTransform, fontSize: parseFloat(cs.fontSize) };
          });
          expect(style.textTransform, `nhãn trường[${i}] của node ${id} in hoa bằng CSS`).toBe("uppercase");
          expect(Math.round(style.fontSize), `nhãn trường[${i}] của node ${id} cỡ 11px`).toBe(11);
        }
      }

      // Ô chọn lời nhắc/file âm thanh, hàng đợi, múi giờ cao 38px.
      const heightCases: Array<{ nodeId: string; field: string }> = [
        { nodeId: "play-info", field: "mediaId" },
        { nodeId: "menu", field: "promptMediaId" },
        { nodeId: "queue", field: "queueRef" },
        { nodeId: "schedule", field: "timezone" },
      ];
      for (const { nodeId, field } of heightCases) {
        const inspector = await selectNode(page, nodeId);
        const control = inspector.locator(`[data-field="${field}"]`).first();
        const size = await layoutSize(control);
        expect(Math.round(size.height), `[data-field="${field}"] của ${nodeId} cao 38px`).toBe(38);
      }

      // Node Menu — thanh trượt timeoutSeconds/maxRetries.
      const menuInspector = await selectNode(page, "menu");
      const timeoutSlider = menuInspector.locator('input[type="range"][data-field="timeoutSeconds"]');
      await expect(timeoutSlider).toHaveAttribute("min", "1");
      await expect(timeoutSlider).toHaveAttribute("max", "30");
      const retriesSlider = menuInspector.locator('input[type="range"][data-field="maxRetries"]');
      await expect(retriesSlider).toHaveAttribute("min", "0");
      await expect(retriesSlider).toHaveAttribute("max", "5");

      const rangeLabels = menuInspector.locator('[data-testid="inspector-range-label"]');
      await expect(rangeLabels).toHaveCount(2);
      const rangeLabelTexts = (await rangeLabels.allTextContents()).map((t) => t.trim());
      expect(rangeLabelTexts.sort()).toEqual(["Số lần lặp lại", "Thời gian chờ"].sort());
      for (let i = 0; i < 2; i += 1) {
        const style = await rangeLabels.nth(i).evaluate((el) => {
          const cs = getComputedStyle(el);
          return { textTransform: cs.textTransform, fontSize: parseFloat(cs.fontSize) };
        });
        expect(style.textTransform, `inspector-range-label[${i}] không in hoa bằng CSS`).not.toBe("uppercase");
        expect(Math.round(style.fontSize), `inspector-range-label[${i}] cỡ 14px`).toBe(14);
      }

      // Nhãn của từng hàng — dùng để đối chiếu cạnh với inspector-range-value
      // cùng hàng (AC-42 "đo đủ Then", cả hai thanh trượt).
      const timeoutLabel = rangeLabels.filter({ hasText: "Thời gian chờ" });
      const retriesLabel = rangeLabels.filter({ hasText: "Số lần lặp lại" });

      // `<n>s` (timeoutSeconds) khác `<n> lần` (maxRetries) — phân biệt bằng
      // chữ hiển thị, không giả định `data-field` có mặt trên chính span
      // hiển thị giá trị (lot-brief chỉ chốt `data-field` trên `input[type=range]`).
      const timeoutValue = menuInspector.locator('[data-testid="inspector-range-value"]', { hasText: /^\d+s$/ });
      await expect(timeoutValue).toHaveCount(1);
      const monoFont = await resolvedVar(page, "font-family", "--mono");
      const timeoutValueFont = await timeoutValue.evaluate((el) => getComputedStyle(el).fontFamily);
      expect(timeoutValueFont, "inspector-range-value chữ --mono").toBe(monoFont);
      await expect(timeoutValue).toHaveText("5s");

      const timeoutLabelBox = await timeoutLabel.boundingBox();
      const timeoutValueBox = await timeoutValue.boundingBox();
      if (!timeoutLabelBox || !timeoutValueBox) {
        throw new Error("không lấy được boundingBox hàng Thời gian chờ");
      }
      expect(
        timeoutValueBox.x,
        "inspector-range-value nằm bên phải inspector-range-label cùng hàng (Thời gian chờ)",
      ).toBeGreaterThanOrEqual(timeoutLabelBox.x + timeoutLabelBox.width);

      const dirtyStatus = page.locator('[data-testid="dirty-status"]');
      const nodeSummary = page
        .locator('.react-flow__node[data-id="menu"] [data-testid="node-summary"]');

      // Thanh trượt maxRetries — trước khối timeoutSeconds (AC-42, mock maxRetries: 1).
      await expect(dirtyStatus).toHaveText("đã lưu");
      const retriesValue = menuInspector.locator('[data-testid="inspector-range-value"]', { hasText: /^\d+ lần$/ });
      await expect(retriesValue).toHaveCount(1);
      await expect(retriesValue).toHaveText("1 lần");
      const retriesLabelBox = await retriesLabel.boundingBox();
      const retriesValueBox = await retriesValue.boundingBox();
      if (!retriesLabelBox || !retriesValueBox) {
        throw new Error("không lấy được boundingBox hàng Số lần lặp lại");
      }
      expect(
        retriesValueBox.x,
        "inspector-range-value nằm bên phải inspector-range-label cùng hàng (Số lần lặp lại)",
      ).toBeGreaterThanOrEqual(retriesLabelBox.x + retriesLabelBox.width);
      await retriesSlider.focus();
      await page.keyboard.press("ArrowUp");
      await expect(retriesValue).toHaveText("2 lần");
      await expect(dirtyStatus).toHaveText("chưa lưu");

      await timeoutSlider.focus();
      await page.keyboard.press("ArrowUp");
      await expect(timeoutValue).toHaveText("6s");
      await expect(dirtyStatus).toHaveText("chưa lưu");
      await expect(nodeSummary).toContainText("chờ 6s");

      // Node Điều kiện theo lịch — 2 khung.
      const scheduleInspector = await selectNode(page, "schedule");
      const rules = scheduleInspector.locator('[data-testid="schedule-rule"]');
      await expect(rules).toHaveCount(2);

      const bgSub = await resolvedVar(page, "background-color", "--bg-sub");
      for (let i = 0; i < 2; i += 1) {
        const rule = rules.nth(i);
        const bg = await rule.evaluate((el) => getComputedStyle(el).backgroundColor);
        expect(bg, `schedule-rule[${i}] nền --bg-sub`).toBe(bgSub);

        const head = rule.locator('[data-testid="rule-head"]');
        await expect(head).toHaveText(`Khung ${i + 1}`);
        const headSize = await layoutSize(head);
        expect(Math.round(headSize.height), `rule-head[${i}] cao 34px`).toBe(34);
        await expect(rule.locator('[data-testid="rule-remove"]')).toHaveCount(1);

        const axes = rule.locator("[data-axis]");
        const axisCount = await axes.count();
        for (let a = 0; a < axisCount; a += 1) {
          const axis = axes.nth(a);
          const fromCtrl = axis.locator('[data-bound="from"]');
          const toCtrl = axis.locator('[data-bound="to"]');
          const fromSize = await layoutSize(fromCtrl);
          expect(Math.round(fromSize.height), `axis[${a}] from của rule ${i} cao 32px`).toBe(32);
          const toSize = await layoutSize(toCtrl);
          expect(Math.round(toSize.height), `axis[${a}] to của rule ${i} cao 32px`).toBe(32);
          const fromFont = await fromCtrl.evaluate((el) => getComputedStyle(el).fontFamily);
          expect(fromFont, `axis[${a}] from của rule ${i} chữ --mono`).toBe(monoFont);
          const toFont = await toCtrl.evaluate((el) => getComputedStyle(el).fontFamily);
          expect(toFont, `axis[${a}] to của rule ${i} chữ --mono`).toBe(monoFont);
          const arrow = (await axis.textContent()) ?? "";
          expect(arrow, `axis[${a}] của rule ${i} có → giữa hai mốc`).toContain("→");
        }
      }

      // Xoá một khung — còn 1 thẻ ghi "Khung giờ", không nút ×.
      await rules.first().locator('[data-testid="rule-remove"]').click();
      await expect(rules).toHaveCount(1);
      await expect(rules.first().locator('[data-testid="rule-head"]')).toHaveText("Khung giờ");
      await expect(rules.first().locator('[data-testid="rule-remove"]')).toHaveCount(0);

      // Bấm › — khung đóng, không node nào được chọn.
      await scheduleInspector.locator('[data-testid="inspector-close"]').click();
      await expect(page.locator('[data-testid="inspector"]')).toBeHidden();
      await expect(page.locator(".react-flow__node.selected")).toHaveCount(0);
    },
  );

  test6(
    "TC-CALL-025 — bản đồ phím trong inspector: thêm, đổi, xoá phím, giới hạn 12",
    async ({ page }) => {
      await openBuilder(page);
      const inspector = await selectNode(page, "menu");
      const choicesField = inspector.locator('[data-field="choices"]');

      const addBtn = choicesField.locator('[data-testid="choice-add"]');
      const addSize = await layoutSize(addBtn);
      expect(Math.round(addSize.height), "choice-add cao 26px").toBe(26);

      const rowsBefore = choicesField.locator('[data-testid="choice-row"]');
      await expect(rowsBefore).toHaveCount(2);

      for (let i = 0; i < 2; i += 1) {
        const row = rowsBefore.nth(i);
        const keySelect = row.locator('[data-testid="choice-key"]');
        const keySize = await layoutSize(keySelect);
        expect(Math.round(keySize.width), `choice-key[${i}] rộng 44px`).toBe(44);
        expect(Math.round(keySize.height), `choice-key[${i}] cao 34px`).toBe(34);
        const monoFont = await resolvedVar(page, "font-family", "--mono");
        const keyFont = await keySelect.evaluate((el) => getComputedStyle(el).fontFamily);
        expect(keyFont, `choice-key[${i}] chữ --mono`).toBe(monoFont);

        const removeBtn = row.locator('[data-testid="choice-remove"]');
        const removeSize = await layoutSize(removeBtn);
        expect(Math.round(removeSize.width), `choice-remove[${i}] rộng 34px`).toBe(34);
        expect(Math.round(removeSize.height), `choice-remove[${i}] cao 34px`).toBe(34);
      }

      // Không có ô nhập nhãn nhánh trong khối bản đồ phím.
      await expect(choicesField.locator('input[type="text"]')).toHaveCount(0);
      await expect(choicesField.locator("textarea")).toHaveCount(0);

      // Bấm + Phím — thêm phím 3.
      await addBtn.click();
      const rowsAfterAdd = choicesField.locator('[data-testid="choice-row"]');
      await expect(rowsAfterAdd).toHaveCount(3);
      const keysAfterAdd = await rowsAfterAdd
        .locator('[data-testid="choice-key"]')
        .evaluateAll((els) => els.map((el) => (el as HTMLSelectElement).value));
      expect(keysAfterAdd.sort()).toEqual(["1", "2", "3"]);

      // Số issue mức lỗi gốc trước khi đổi phím 2 → 5 (phím 3 chưa nối là
      // một lỗi sẵn — lấy ngay sau + Phím, theo mục "Test phải viết" lô 11).
      // Selector `node-issue[data-severity="error"]` theo Quy ước DOM của
      // `builder-validate.spec.ts` (đã có, lô 4).
      const validateResult = page.locator('[data-testid="validate-result"]');
      await page.locator('[data-testid="validate"]').click();
      await expect(validateResult).toHaveAttribute("data-valid", "false");
      const errorSelector = '.react-flow__node [data-testid="node-issue"][data-severity="error"]';
      const issuesBefore = await page.locator(errorSelector).count();
      expect(issuesBefore, "phím 3 chưa nối phải sinh ít nhất 1 lỗi sẵn trước khi đổi phím").toBeGreaterThanOrEqual(1);

      // Cạnh của phím 2 trước khi đổi — lấy đích cũ từ aria-label mặc định
      // của @xyflow/react ("Edge from <source> to <target>") để đối chiếu
      // sau khi đổi tên nhánh, không đoán id node đích.
      const oldEdge = page.locator('[data-testid="rf__edge-e-menu-choice-2"]');
      await expect(oldEdge).toHaveCount(1);
      const oldEdgeLabel = (await oldEdge.getAttribute("aria-label")) ?? "";
      const oldTargetMatch = oldEdgeLabel.match(/ to (\S+)$/);
      expect(oldTargetMatch, `aria-label của cạnh phím 2 phải chứa đích: "${oldEdgeLabel}"`).toBeTruthy();
      const oldTarget = oldTargetMatch![1];

      // Đổi phím 2 → 5.
      const row2 = choicesField.locator('[data-testid="choice-row"][data-key="2"]');
      await row2.locator('[data-testid="choice-key"]').selectOption("5");

      const newEdge = page.locator('[data-testid="rf__edge-e-menu-choice-5"]');
      await expect(newEdge).toHaveCount(1);
      await expect(page.locator('[data-testid="rf__edge-e-menu-choice-2"]')).toHaveCount(0);
      const newEdgeLabel = (await newEdge.getAttribute("aria-label")) ?? "";
      expect(newEdgeLabel, "cạnh phím 5 phải nối tới đúng đích cũ của phím 2").toContain(` to ${oldTarget}`);

      await page.locator('[data-testid="validate"]').click();
      await expect(validateResult).toHaveAttribute("data-valid", "false");
      const issuesAfter = await page.locator(errorSelector).count();
      expect(issuesAfter, "đổi phím 2→5 không sinh lỗi mới").toBe(issuesBefore);

      // Xoá một phím — nhánh biến mất khỏi thẻ node.
      const rowsBeforeRemove = choicesField.locator('[data-testid="choice-row"]');
      const keysBeforeRemove = await rowsBeforeRemove
        .locator('[data-testid="choice-key"]')
        .evaluateAll((els) => els.map((el) => (el as HTMLSelectElement).value));
      const keyToRemove = keysBeforeRemove[0];
      await choicesField
        .locator(`[data-testid="choice-row"][data-key="${keyToRemove}"] [data-testid="choice-remove"]`)
        .click();
      await expect(rowsBeforeRemove).toHaveCount(2);
      await expect(
        page.locator(`.react-flow__node[data-id="menu"] [data-testid="handle-label"][data-handleid="choice-${keyToRemove}"]`),
      ).toHaveCount(0);

      // Xoá tới còn 1 phím — nút × của phím đó vô hiệu.
      const rowsNow = choicesField.locator('[data-testid="choice-row"]');
      await rowsNow.first().locator('[data-testid="choice-remove"]').click();
      await expect(rowsNow).toHaveCount(1);
      await expect(rowsNow.first().locator('[data-testid="choice-remove"]')).toBeDisabled();

      // Thêm tới đủ 12 phím — + Phím vô hiệu.
      for (let i = 0; i < 11; i += 1) {
        await addBtn.click();
      }
      await expect(choicesField.locator('[data-testid="choice-row"]')).toHaveCount(12);
      await expect(addBtn).toBeDisabled();
    },
  );
});
