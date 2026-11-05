import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Lô 12 — AC-48 (TC-CALL-026).
 *
 * FLOW_KEYMAP (mock thêm cuối flowStore/versionStore theo lot-brief lô 12):
 * id 5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d402, 7 node — keymap-start (start),
 * keymap-menu (menu, 5 phím), keymap-cskh (queue, label "Chuyển hàng đợi
 * CSKH", đích phím 1), keymap-nolabel (play, không có label, đích phím 2),
 * keymap-blank (hangup, label toàn khoảng trắng, đích phím 3), keymap-long
 * (play, label đúng 200 ký tự, đích phím 4), keymap-gone (hangup, đích
 * phím 5 — sẽ bị xoá trong test để tái tạo "phím 5 trỏ id không có").
 *
 * stepLabel kỳ vọng (lot-brief dòng 117): phím 2 → "Phát lời thoại",
 * phím 3 → "Kết thúc".
 *
 * Quy ước chọn node: bỏ chọn (click pane trống) trước khi chọn node kế —
 * cùng quy ước lô 9/11 (inspector-visual.spec.ts). Trước mọi thao tác trên
 * cạnh/điểm nối của canvas phải bỏ chọn trước (Rủi ro lô 12: inspector
 * 360px che mép phải canvas).
 */

const FLOW_URL = "/#/flows/5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d402";
const INITIAL_NODE_COUNT = 7;

async function openBuilder(page: Page) {
  await page.goto(FLOW_URL);
  await expect(page.locator(".react-flow__node")).toHaveCount(INITIAL_NODE_COUNT);
}

async function deselectNode(page: Page): Promise<void> {
  await page.locator(".react-flow__pane").click({ position: { x: 5, y: 5 } });
}

async function selectNode(page: Page, nodeId: string): Promise<Locator> {
  await deselectNode(page);
  await page.locator(`.react-flow__node[data-id="${nodeId}"]`).click();
  const inspector = page.locator('[data-testid="inspector"]');
  await expect(inspector).toBeVisible();
  return inspector;
}

async function menuChoicesField(page: Page): Promise<Locator> {
  const inspector = await selectNode(page, "keymap-menu");
  return inspector.locator('[data-field="choices"]');
}

function choiceRow(choicesField: Locator, key: string): Locator {
  return choicesField.locator(`[data-testid="choice-row"][data-key="${key}"]`);
}

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

async function layoutHeight(el: Locator): Promise<number> {
  return el.evaluate((e) => parseFloat(getComputedStyle(e).height));
}

/** Điểm giữa (toạ độ màn hình thật) của cạnh — dùng getPointAtLength thay vì
 * boundingBox của group svg (không chắc nằm đúng trên nét vẽ). */
async function edgeMidpoint(edgePath: Locator): Promise<{ x: number; y: number }> {
  const point = await edgePath.evaluate((el) => {
    const path = el as unknown as SVGPathElement;
    const len = path.getTotalLength();
    const p = path.getPointAtLength(len / 2);
    const ctm = path.getScreenCTM();
    if (!ctm) return null;
    const t = p.matrixTransform(ctm);
    return { x: t.x, y: t.y };
  });
  if (!point) throw new Error("Không lấy được điểm giữa cạnh (getScreenCTM null)");
  return point;
}

const kmTest = test.extend<{ _captureConsoleErrors: void }>({
  _captureConsoleErrors: [
    async ({ page }, use) => {
      const pageErrors: Error[] = [];
      const consoleErrors: string[] = [];
      page.on("pageerror", (err) => pageErrors.push(err));
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      await use();
      expect(pageErrors, "0 sự kiện pageerror").toEqual([]);
      expect(consoleErrors, "0 console error").toEqual([]);
    },
    { auto: true },
  ],
});

kmTest.describe("keymap-target", () => {
  kmTest.use({ viewport: { width: 1440, height: 900 } });

  kmTest(
    "TC-CALL-026 — bản đồ phím hiện tên node đích chỉ đọc",
    async ({ page }) => {
      await openBuilder(page);

      // Baseline "không mở phần tử mới" — đếm trước khi thao tác gì.
      const countDialogs = () => page.getByRole("dialog").count();
      const countTooltips = () => page.getByRole("tooltip").count();
      const countDrawers = () => page.locator('[data-testid="versions-drawer"]').count();
      const dialogsBefore = await countDialogs();
      const tooltipsBefore = await countTooltips();
      const drawersBefore = await countDrawers();

      let choicesField = await menuChoicesField(page);
      const dirtyStatus = page.locator('[data-testid="dirty-status"]');
      await expect(dirtyStatus).toHaveText("đã lưu");

      const sansFont = await resolvedVar(page, "font-family", "--sans");
      const fg2 = await resolvedVar(page, "color", "--fg-2");
      const fg3 = await resolvedVar(page, "color", "--fg-3");

      // Hàng phím 1 — "→ Chuyển hàng đợi CSKH", --sans 14px, --fg-2, nằm
      // giữa choice-key và choice-remove trong DOM.
      const row1 = choiceRow(choicesField, "1");
      const target1 = row1.locator('[data-testid="choice-target"]');
      await expect(target1).toHaveText("→ Chuyển hàng đợi CSKH");
      await expect(target1).toHaveAttribute("data-state", "linked");
      const target1Style = await target1.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { fontFamily: cs.fontFamily, fontSize: parseFloat(cs.fontSize), color: cs.color };
      });
      expect(target1Style.fontFamily, "choice-target chữ --sans").toBe(sansFont);
      expect(Math.round(target1Style.fontSize), "choice-target cỡ 14px").toBe(14);
      expect(target1Style.color, "choice-target phím 1 màu --fg-2").toBe(fg2);

      const domOrder = await row1.evaluate((el) =>
        Array.from(el.querySelectorAll("[data-testid]")).map((e) => e.getAttribute("data-testid")),
      );
      expect(domOrder.indexOf("choice-target")).toBeGreaterThan(domOrder.indexOf("choice-key"));
      expect(domOrder.indexOf("choice-target")).toBeLessThan(domOrder.indexOf("choice-remove"));

      // choice-target không phải ô nhập, không title/aria-label/tabindex.
      const tagName = await target1.evaluate((el) => el.tagName);
      expect(tagName).toBe("SPAN");
      await expect(target1).not.toHaveAttribute("title", /.+/);
      await expect(target1).not.toHaveAttribute("aria-label", /.+/);
      await expect(target1).not.toHaveAttribute("tabindex", /.+/);

      // Hàng phím 2, 3 — tên loại bước của node đích.
      const target2 = choiceRow(choicesField, "2").locator('[data-testid="choice-target"]');
      await expect(target2).toHaveText("→ Phát lời thoại");
      const target3 = choiceRow(choicesField, "3").locator('[data-testid="choice-target"]');
      await expect(target3).toHaveText("→ Kết thúc");

      // Hàng phím 4 — tràn chỗ trống, ellipsis một dòng, cao bằng hàng phím 1.
      const target4 = choiceRow(choicesField, "4").locator('[data-testid="choice-target"]');
      const style4 = await target4.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { whiteSpace: cs.whiteSpace, overflow: cs.overflow, textOverflow: cs.textOverflow };
      });
      expect(style4.whiteSpace, "choice-target phím 4 không xuống dòng").toBe("nowrap");
      expect(style4.overflow, "choice-target phím 4 overflow hidden").toBe("hidden");
      expect(style4.textOverflow, "choice-target phím 4 ellipsis").toBe("ellipsis");
      const overflowing4 = await target4.evaluate((el) => el.scrollWidth > el.clientWidth);
      expect(overflowing4, "choice-target phím 4 (200 ký tự) phải tràn khỏi hộp").toBe(true);
      const row1Height = await layoutHeight(row1);
      const row4Height = await layoutHeight(choiceRow(choicesField, "4"));
      expect(Math.round(row4Height), "hàng phím 4 cao bằng hàng phím 1").toBe(Math.round(row1Height));

      // rê chuột lên choice-target phím 1: không tooltip tự vẽ.
      await target1.hover();
      expect(await countTooltips(), "rê chuột lên choice-target không sinh [role=tooltip]").toBe(tooltipsBefore);

      // bấm vào: không đổi node đang chọn, không đổi dirty-status, không mở phần tử mới.
      await target1.click();
      await expect(page.locator(".react-flow__node.selected")).toHaveAttribute("data-id", "keymap-menu");
      await expect(dirtyStatus).toHaveText("đã lưu");
      expect(await countDialogs(), "bấm choice-target không mở dialog mới").toBe(dialogsBefore);
      expect(await countTooltips(), "bấm choice-target không mở tooltip mới").toBe(tooltipsBefore);
      expect(await countDrawers(), "bấm choice-target không mở drawer mới").toBe(drawersBefore);

      // Xoá node đích của phím 5 (keymap-gone) — tái tạo "phím 5 trỏ id
      // không có" bằng thao tác, vì `choices` giữ nguyên id cũ (không có
      // đường lùi dựng Given khác — Rủi ro lô 12).
      await deselectNode(page);
      await page.locator('.react-flow__node[data-id="keymap-gone"]').click();
      await page.keyboard.press("Backspace");
      await expect(page.locator(".react-flow__node")).toHaveCount(INITIAL_NODE_COUNT - 1);

      choicesField = await menuChoicesField(page);
      const target5 = choiceRow(choicesField, "5").locator('[data-testid="choice-target"]');
      await expect(target5).toHaveText("Chưa nối");
      await expect(target5).toHaveAttribute("data-state", "unlinked");
      const target5Color = await target5.evaluate((el) => getComputedStyle(el).color);
      expect(target5Color, "choice-target phím 5 màu --fg-3").toBe(fg3);

      // Bấm + Phím — phím mới hiện Chưa nối.
      const keysBeforeAdd = await choicesField
        .locator('[data-testid="choice-row"]')
        .evaluateAll((els) => els.map((el) => el.getAttribute("data-key")));
      await choicesField.locator('[data-testid="choice-add"]').click();
      const keysAfterAdd = await choicesField
        .locator('[data-testid="choice-row"]')
        .evaluateAll((els) => els.map((el) => el.getAttribute("data-key")));
      const newKey = keysAfterAdd.find((k) => k !== null && !keysBeforeAdd.includes(k));
      expect(newKey, "phải sinh đúng 1 phím mới").toBeTruthy();
      const newTarget = choiceRow(choicesField, newKey!).locator('[data-testid="choice-target"]');
      await expect(newTarget).toHaveText("Chưa nối");
      await expect(newTarget).toHaveAttribute("data-state", "unlinked");

      // Sửa Tên bước của node đích phím 1 (keymap-cskh), chọn lại menu —
      // chưa bấm lưu — hàng phím 1 hiện tên mới.
      const cskhInspector = await selectNode(page, "keymap-cskh");
      const nameInput = cskhInspector.locator('input[data-field="label"]');
      await nameInput.fill("Chuyển hàng đợi CSKH (đổi tên)");
      await nameInput.blur();
      choicesField = await menuChoicesField(page);
      await expect(choiceRow(choicesField, "1").locator('[data-testid="choice-target"]')).toHaveText(
        "→ Chuyển hàng đợi CSKH (đổi tên)",
      );

      // Xoá cạnh của phím 1 trên canvas — chọn lại menu → Chưa nối.
      await deselectNode(page);
      const edge1 = page.locator('[data-testid="rf__edge-e-keymap-menu-choice-1"]');
      await expect(edge1).toHaveCount(1);
      const edge1Path = edge1.locator(".react-flow__edge-path");
      const mid1 = await edgeMidpoint(edge1Path);
      await page.mouse.click(mid1.x, mid1.y);
      await expect(edge1).toHaveClass(/selected/);
      await page.keyboard.press("Backspace");
      await expect(page.locator('[data-testid="rf__edge-e-keymap-menu-choice-1"]')).toHaveCount(0);

      choicesField = await menuChoicesField(page);
      const target1AfterUnlink = choiceRow(choicesField, "1").locator('[data-testid="choice-target"]');
      await expect(target1AfterUnlink).toHaveText("Chưa nối");
      await expect(target1AfterUnlink).toHaveAttribute("data-state", "unlinked");

      // Nối phím 1 sang một node khác (keymap-nolabel) bằng page.mouse —
      // chọn lại menu hiện tên node mới.
      await deselectNode(page);
      const edgesBeforeConnect = await page.locator(".react-flow__edge").count();
      const sourceHandle = page.locator(
        '.react-flow__node[data-id="keymap-menu"] .react-flow__handle.source[data-handleid="choice-1"]',
      );
      const targetHandle = page
        .locator('.react-flow__node[data-id="keymap-nolabel"] .react-flow__handle.target')
        .first();
      const sourceBox = await sourceHandle.boundingBox();
      const targetBox = await targetHandle.boundingBox();
      if (!sourceBox || !targetBox) {
        throw new Error("Không tìm thấy handle nguồn choice-1 hoặc handle đích keymap-nolabel");
      }
      await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 20 });
      await page.mouse.up();
      await expect(page.locator(".react-flow__edge")).toHaveCount(edgesBeforeConnect + 1);

      choicesField = await menuChoicesField(page);
      const target1AfterRelink = choiceRow(choicesField, "1").locator('[data-testid="choice-target"]');
      await expect(target1AfterRelink).toHaveText("→ Phát lời thoại");
      await expect(target1AfterRelink).toHaveAttribute("data-state", "linked");

      // Thẻ node Menu trên canvas không hiện tên sau phím — chỉ "Phím <k>".
      const branchLabel1 = page.locator(
        '.react-flow__node[data-id="keymap-menu"] [data-testid="handle-label"][data-handleid="choice-1"]',
      );
      await expect(branchLabel1).toHaveText("Phím 1");

      // Không mở phần tử mới sau toàn bộ chuỗi thao tác.
      expect(await countDialogs(), "toàn bộ kịch bản không mở dialog mới").toBe(dialogsBefore);
      expect(await countTooltips(), "toàn bộ kịch bản không mở tooltip mới").toBe(tooltipsBefore);
      expect(await countDrawers(), "toàn bộ kịch bản không mở drawer mới").toBe(drawersBefore);
    },
  );
});
