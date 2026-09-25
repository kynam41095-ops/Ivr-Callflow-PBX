import { expect, test, type Page } from "@playwright/test";

/**
 * Lô 9 — AC-34…AC-37 (TC-FLOW-032, TC-FLOW-033, TC-FLOW-029, TC-FLOW-034).
 * Kịch bản giả lập dùng lại `FLOW_MAIN` (id gõ cứng, xem `src/data/mock.ts`,
 * không import) — cùng bộ id với `versions.spec.ts` / `numbers-visual.spec.ts`:
 * 2 phiên bản ban đầu (v1 archived 3 node, v2 published 7 node, 0 draft),
 * 2 đầu số (hotline có publishedVersionId, fresh chưa gán kịch bản).
 *
 * Quy ước "bằng --x" (lot-brief dòng 30): giá trị đã tính của một phần tử dò
 * mang `<prop>: var(--x)`, không so chuỗi thô trên document.documentElement.
 */
const FLOW_MAIN_ID = "5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d401";
const FLOW_URL = `/#/flows/${FLOW_MAIN_ID}`;
const VERSION_MAIN_ARCHIVED = "5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d411";
const VERSION_MAIN_PUBLISHED = "5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d412";
const BASE_NODE_COUNT = 7;

function listenErrors(page: Page, pageErrors: Error[], consoleErrors: string[]) {
  page.on("pageerror", (err) => pageErrors.push(err));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
}

async function openBuilder(page: Page) {
  await page.goto(FLOW_URL);
  await expect(page.locator(".react-flow__node")).toHaveCount(BASE_NODE_COUNT);
}

async function openNumbers(page: Page) {
  await page.goto("/#/numbers");
  await expect(page.locator('[data-testid="numbers-screen"]')).toBeVisible();
}

async function dragStepFromPalette(page: Page, type: string) {
  const item = page.locator(`[data-testid="palette-item"][data-node-type="${type}"]`);
  await item.dragTo(page.locator(".react-flow__pane"));
}

/**
 * Chín phần tử "một hàng" của `builder-toolbar` theo Quy ước chung lô 10:
 * nav-numbers · builder-name · version-select · version-status ·
 * versions-open · dirty-status · validate · save-draft · new-flow.
 */
const ROW_TESTIDS = [
  "nav-numbers",
  "builder-name",
  "version-select",
  "version-status",
  "versions-open",
  "dirty-status",
  "validate",
  "save-draft",
  "new-flow",
] as const;
type RowBoxes = Record<(typeof ROW_TESTIDS)[number], { x: number; y: number; width: number; height: number }>;

async function measureRowElements(page: Page): Promise<RowBoxes> {
  const boxes = {} as RowBoxes;
  for (const id of ROW_TESTIDS) {
    const loc = id === "version-select" ? page.locator('select[data-testid="version-select"]') : page.locator(`[data-testid="${id}"]`);
    const box = await loc.boundingBox();
    if (!box) throw new Error(`không lấy được boundingBox của ${id}`);
    boxes[id] = box;
  }
  return boxes;
}

/** Mọi cặp trong chín phần tử phải giao nhau theo trục dọc (cùng một hàng). */
function assertOneRow(boxes: RowBoxes, label: string) {
  for (let i = 0; i < ROW_TESTIDS.length; i += 1) {
    for (let j = i + 1; j < ROW_TESTIDS.length; j += 1) {
      const a = boxes[ROW_TESTIDS[i]];
      const b = boxes[ROW_TESTIDS[j]];
      const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      expect(
        overlap,
        `${label}: ${ROW_TESTIDS[i]} và ${ROW_TESTIDS[j]} phải giao nhau theo trục dọc (một hàng)`,
      ).toBeGreaterThan(0);
    }
    // Thứ tự trái→phải đúng DOM: nav-numbers · builder-name · version-select
    // · version-status · versions-open · dirty-status · validate · save-draft
    // · new-flow (Quy ước chung lô 10).
    if (i > 0) {
      const prev = boxes[ROW_TESTIDS[i - 1]];
      const cur = boxes[ROW_TESTIDS[i]];
      expect(
        cur.x,
        `${label}: ${ROW_TESTIDS[i]} phải nằm bên phải ${ROW_TESTIDS[i - 1]} (thứ tự DOM)`,
      ).toBeGreaterThanOrEqual(prev.x);
    }
  }
}

/** Mép phải `new-flow` phải cách mép phải `builder-toolbar` đúng 16 px. */
function assertRightGap16(
  boxes: RowBoxes,
  toolbarBox: { x: number; width: number },
  label: string,
) {
  const toolbarRight = toolbarBox.x + toolbarBox.width;
  const gap = toolbarRight - (boxes["new-flow"].x + boxes["new-flow"].width);
  expect(
    Math.round(gap),
    `${label}: mép phải new-flow cách mép phải builder-toolbar 16 px`,
  ).toBe(16);
}

/** Giá trị CSS đã tính của một phần tử dò mang `<cssProp>: var(<varName>)`. */
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

/**
 * `background-color` mặc định của trình duyệt cho `<button>` khi hoàn toàn
 * không có CSS trang áp vào — dựng trong một iframe `about:blank` riêng
 * (iframe không kế thừa stylesheet của trang cha) để lấy giá trị gốc thật
 * của Chromium, không đoán một mã màu cố định.
 */
async function nativeButtonBackground(page: Page): Promise<string> {
  return page.evaluate(() => {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    if (!doc) throw new Error("không lấy được contentDocument của iframe dò");
    const btn = doc.createElement("button");
    doc.body.appendChild(btn);
    const value = iframe.contentWindow!.getComputedStyle(btn).backgroundColor;
    iframe.remove();
    return value;
  });
}

test.describe("chrome-visual", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("TC-FLOW-032 — đầu trình dựng và thanh trạng thái canvas đúng kịch bản đang mở, đổi theo lưu/kiểm tra hợp lệ", async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];
    listenErrors(page, pageErrors, consoleErrors);

    await openBuilder(page);

    // AC-40: đo bố cục "một hàng" lúc nghỉ (trước khi lưu nháp), trước khi
    // chạy các kiểm còn lại của AC-34.
    assertOneRow(await measureRowElements(page), "lúc nghỉ, trước lưu nháp");

    const toolbar = page.locator('[data-testid="builder-toolbar"]');
    await expect(toolbar).toBeVisible();
    await expect(toolbar.locator('[data-testid="nav-numbers"]')).toBeVisible();
    await expect(toolbar.locator('[data-testid="builder-number"]')).toBeVisible();
    await expect(toolbar.locator('[data-testid="builder-flow-name"]')).toBeVisible();

    // Dòng phụ builder-meta = provider · kind của đầu số đang gán FLOW_MAIN.
    await expect(toolbar.locator('[data-testid="builder-meta"]')).toHaveText("Viettel · Hotline 1900");

    // save-draft nền --acc.
    const acc = await resolvedVar(page, "background-color", "--acc");
    const saveDraftBg = await toolbar
      .locator('[data-testid="save-draft"]')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(saveDraftBg, "save-draft nền --acc").toBe(acc);

    const versionSelect = toolbar.locator('select[data-testid="version-select"]');
    const versionStatus = toolbar.locator('[data-testid="version-status"]');
    const dirtyStatus = toolbar.locator('[data-testid="dirty-status"]');
    const canvasStatus = page.locator('[data-testid="canvas-status"]');

    // Given của TC-FLOW-032: trình dựng đang có bản published và bản nháp —
    // lưu nháp trước, rồi mới kiểm nội dung đầu trang trên trạng thái đó.
    await page.locator('[data-testid="save-draft"]').click();
    await expect(page.locator('[data-testid="save-status"]')).toHaveAttribute("data-state", "saved", {
      timeout: 3000,
    });

    // Ba phiên bản: published (v2) + archived (v1) + nháp vừa lưu (v3).
    const optionTexts = await versionSelect.locator("option").allTextContents();
    expect(optionTexts).toHaveLength(3);
    for (const text of optionTexts) {
      expect(text.trim(), `chữ mỗi option version-select: "${text}"`).toMatch(
        /^v\d+ · (đang chạy|nháp|lưu trữ)$/,
      );
    }

    await expect(versionStatus.locator('[data-testid="status-dot"]')).toHaveCount(1);
    const dotColor = await versionStatus
      .locator('[data-testid="status-dot"]')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(dotColor, "chấm trạng thái phiên bản không trong suốt").not.toBe("rgba(0, 0, 0, 0)");
    const versionStatusText = (await versionStatus.textContent())?.trim() ?? "";
    expect(
      ["Đang chạy thật", "Bản nháp", "Lưu trữ"],
      `chữ version-status: "${versionStatusText}"`,
    ).toContain(versionStatusText);

    await expect(toolbar.locator('[data-testid="versions-open"]')).toHaveText("Phiên bản · 3");

    await expect(dirtyStatus).toHaveText("đã lưu");
    await expect(dirtyStatus).toHaveAttribute("data-state", "saved");

    // Thanh trạng thái canvas: hai số phải khớp chính đồ thị đang render —
    // đối chiếu với chính DOM (.react-flow__node / .react-flow__edge) thay vì
    // đoán một con số cố định.
    const actualNodeCount = await page.locator(".react-flow__node").count();
    const actualEdgeCount = await page.locator(".react-flow__edge").count();
    expect(actualNodeCount).toBe(BASE_NODE_COUNT);

    await expect(canvasStatus).toHaveText(`${actualNodeCount} node · ${actualEdgeCount} nhánh · hợp lệ`);

    // Palette mặc định thu gọn (lô 10) — palette-label chỉ render khi mở,
    // mở rộng trước khi đọc nhãn (Rủi ro của lô 10 trong lot-brief).
    await page.locator('[data-testid="palette-toggle"]').click();
    await expect(page.locator('[data-testid="palette"]')).toHaveAttribute("data-state", "expanded");

    // Nhãn palette không tràn ở 1440 px (vd. "Điều kiện theo lịch").
    const paletteLabels = page.locator('[data-testid="palette-label"]');
    const paletteLabelCount = await paletteLabels.count();
    expect(paletteLabelCount).toBeGreaterThan(0);
    for (let i = 0; i < paletteLabelCount; i += 1) {
      const label = paletteLabels.nth(i);
      const overflow = await label.evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow, `palette-label[${i}] không được tràn`).toBeLessThanOrEqual(0);
    }

    // Kéo một node có sẵn trên canvas — nháp "chưa lưu", lưu lại "đã lưu".
    const draggedNode = page.locator(".react-flow__node").first();
    const draggedBoxBefore = await draggedNode.boundingBox();
    if (!draggedBoxBefore) throw new Error("không lấy được boundingBox của node để kéo");
    const dragStartX = draggedBoxBefore.x + draggedBoxBefore.width / 2;
    const dragStartY = draggedBoxBefore.y + draggedBoxBefore.height / 2;
    await page.mouse.move(dragStartX, dragStartY);
    await page.mouse.down();
    await page.mouse.move(dragStartX + 120, dragStartY + 80, { steps: 10 });
    await page.mouse.up();

    await expect(dirtyStatus).toHaveText("chưa lưu");
    await expect(dirtyStatus).toHaveAttribute("data-state", "unsaved");
    // "chưa lưu" vẫn một hàng.
    assertOneRow(await measureRowElements(page), "trạng thái chưa lưu");

    await page.locator('[data-testid="save-draft"]').click();
    await expect(page.locator('[data-testid="save-status"]')).toHaveAttribute("data-state", "saved", {
      timeout: 3000,
    });
    await expect(dirtyStatus).toHaveText("đã lưu");
    await expect(dirtyStatus).toHaveAttribute("data-state", "saved");
    // "đã lưu" vẫn một hàng.
    assertOneRow(await measureRowElements(page), "trạng thái đã lưu");

    // Thả một node Kết thúc không nối, bấm kiểm tra hợp lệ.
    await dragStepFromPalette(page, "hangup");
    await expect(page.locator(".react-flow__node")).toHaveCount(BASE_NODE_COUNT + 1);
    await page.locator('[data-testid="validate"]').click();

    await expect(canvasStatus).toHaveText(/1 cảnh báo$/, { timeout: 3000 });
    await expect(dirtyStatus).toHaveText("chưa lưu");
    await expect(dirtyStatus).toHaveAttribute("data-state", "unsaved");

    expect(pageErrors, "0 sự kiện pageerror").toEqual([]);
    expect(consoleErrors, "0 console error").toEqual([]);
  });

  test("TC-FLOW-032 (CR 5) — đầu trang một hàng giữ nguyên bề rộng (trừ builder-name) ở 1440 và 1131 px, cả ba trạng thái nghỉ/chưa lưu/đã lưu", async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];
    listenErrors(page, pageErrors, consoleErrors);

    type StateName = "rest" | "dirty" | "saved";
    const STATE_LABELS: Record<StateName, string> = {
      rest: "lúc nghỉ",
      dirty: "chưa lưu",
      saved: "đã lưu",
    };
    const byViewport: Record<number, Record<StateName, RowBoxes>> = {};

    for (const width of [1440, 1131] as const) {
      await page.setViewportSize({ width, height: 900 });
      // Buộc tải trang thật: page.goto tới cùng URL hash trước đó không
      // reload SPA (điều hướng cùng tài liệu), khiến kho giả lập giữ bản
      // nháp đã lưu từ vòng viewport trước. Đi qua about:blank trước để
      // vòng viewport sau luôn khởi động từ seed sạch.
      await page.goto("about:blank");
      await openBuilder(page);

      const states = {} as Record<StateName, RowBoxes>;

      // Trạng thái nghỉ.
      const toolbarBoxRest = await page.locator('[data-testid="builder-toolbar"]').boundingBox();
      if (!toolbarBoxRest) throw new Error("không lấy được boundingBox của builder-toolbar");
      states.rest = await measureRowElements(page);
      assertOneRow(states.rest, `${width}×900 ${STATE_LABELS.rest}`);
      assertRightGap16(states.rest, toolbarBoxRest, `${width}×900 ${STATE_LABELS.rest}`);
      // Chứng minh trạng thái tươi (kho giả lập về seed, không giữ bản nháp
      // đã lưu ở vòng viewport trước).
      await expect(page.locator('[data-testid="versions-open"]')).toHaveText("Phiên bản · 2");

      // Kéo một node có sẵn trên canvas — "chưa lưu".
      const draggedNode = page.locator(".react-flow__node").first();
      const draggedBoxBefore = await draggedNode.boundingBox();
      if (!draggedBoxBefore) throw new Error("không lấy được boundingBox của node để kéo");
      const dragStartX = draggedBoxBefore.x + draggedBoxBefore.width / 2;
      const dragStartY = draggedBoxBefore.y + draggedBoxBefore.height / 2;
      await page.mouse.move(dragStartX, dragStartY);
      await page.mouse.down();
      await page.mouse.move(dragStartX + 120, dragStartY + 80, { steps: 10 });
      await page.mouse.up();
      await expect(page.locator('[data-testid="dirty-status"]')).toHaveText("chưa lưu");

      const toolbarBoxDirty = await page.locator('[data-testid="builder-toolbar"]').boundingBox();
      if (!toolbarBoxDirty) throw new Error("không lấy được boundingBox của builder-toolbar");
      states.dirty = await measureRowElements(page);
      assertOneRow(states.dirty, `${width}×900 ${STATE_LABELS.dirty}`);
      assertRightGap16(states.dirty, toolbarBoxDirty, `${width}×900 ${STATE_LABELS.dirty}`);

      // Lưu nháp — "đã lưu".
      await page.locator('[data-testid="save-draft"]').click();
      await expect(page.locator('[data-testid="save-status"]')).toHaveAttribute("data-state", "saved", {
        timeout: 3000,
      });
      await expect(page.locator('[data-testid="dirty-status"]')).toHaveText("đã lưu");

      const toolbarBoxSaved = await page.locator('[data-testid="builder-toolbar"]').boundingBox();
      if (!toolbarBoxSaved) throw new Error("không lấy được boundingBox của builder-toolbar");
      states.saved = await measureRowElements(page);
      assertOneRow(states.saved, `${width}×900 ${STATE_LABELS.saved}`);
      assertRightGap16(states.saved, toolbarBoxSaved, `${width}×900 ${STATE_LABELS.saved}`);

      byViewport[width] = states;
    }

    // "co và cắt": builder-name ở 1131 hẹp hơn ở 1440; builder-flow-name,
    // builder-meta co lại bằng text-overflow: ellipsis (đo ở trạng thái nghỉ).
    expect(
      byViewport[1131].rest["builder-name"].width,
      "builder-name ở 1131 hẹp hơn ở 1440",
    ).toBeLessThan(byViewport[1440].rest["builder-name"].width);

    await page.setViewportSize({ width: 1131, height: 900 });
    await openBuilder(page);
    for (const testid of ["builder-flow-name", "builder-meta"] as const) {
      const overflow = await page
        .locator(`[data-testid="${testid}"]`)
        .evaluate((el) => getComputedStyle(el).textOverflow);
      expect(overflow, `${testid} phải text-overflow: ellipsis`).toBe("ellipsis");
    }

    // Bề rộng ±1 px chỉ so giữa hai viewport trong cùng một trạng thái —
    // không so giữa các trạng thái (lưu nháp đổi chữ versions-open,
    // dirty-status là hợp lệ, không phải hồi quy bố cục).
    for (const state of ["rest", "dirty", "saved"] as const) {
      for (const id of ROW_TESTIDS) {
        if (id === "builder-name") continue;
        expect(
          Math.abs(byViewport[1131][state][id].width - byViewport[1440][state][id].width),
          `${id} giữ nguyên bề rộng ở 1131 so với 1440, trạng thái "${STATE_LABELS[state]}" (±1 px)`,
        ).toBeLessThanOrEqual(1);
      }
    }

    expect(pageErrors, "0 sự kiện pageerror").toEqual([]);
    expect(consoleErrors, "0 console error").toEqual([]);
  });

  test("TC-FLOW-032 (CR 5) — kịch bản chưa gán đầu số mở bằng new-flow: dòng 1 ghi Chưa gán đầu số, không dòng phụ", async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];
    listenErrors(page, pageErrors, consoleErrors);

    await openBuilder(page);
    const urlBefore = page.url();

    await page.locator('[data-testid="new-flow"]').click();
    await expect(page).not.toHaveURL(urlBefore);

    const builderName = page.locator('[data-testid="builder-name"]');
    await expect(builderName).toContainText("Chưa gán đầu số");
    await expect(page.locator('[data-testid="builder-meta"]')).toHaveCount(0);
    assertOneRow(await measureRowElements(page), "kịch bản chưa gán đầu số");

    expect(pageErrors, "0 sự kiện pageerror").toEqual([]);
    expect(consoleErrors, "0 console error").toEqual([]);
  });

  test("TC-FLOW-033 — drawer phiên bản: mã, chấm màu, tên, người tạo/thời điểm; đúng một mục Đang mở, đổi theo version-select", async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];
    listenErrors(page, pageErrors, consoleErrors);

    await openBuilder(page);

    const windowWidth = (page.viewportSize() ?? { width: 1440 }).width;

    await page.locator('button[data-testid="versions-open"]').click();
    const drawer = page.locator('aside[data-testid="versions-drawer"]');
    await expect(drawer).toBeVisible();

    const drawerBox = await drawer.boundingBox();
    if (!drawerBox) throw new Error("không lấy được boundingBox của drawer");
    expect(Math.round(drawerBox.x + drawerBox.width), "cạnh phải drawer = bề rộng cửa sổ").toBe(windowWidth);

    const items = drawer.locator('li[data-testid="version-item"]');
    await expect(items).toHaveCount(2);

    for (let i = 0; i < 2; i += 1) {
      const item = items.nth(i);
      const versionId = await item.getAttribute("data-version-id");
      expect(versionId, `version-item[${i}] phải có data-version-id`).toBeTruthy();

      const code = (await item.locator('[data-testid="version-code"]').textContent())?.trim() ?? "";
      expect(code, `version-code của item ${i}`).toMatch(/^v\d+$/);

      const chip = item.locator('[data-testid="version-chip"]');
      await expect(chip, `version-chip của item ${i}`).toHaveCount(1);
      const chipDot = chip.locator(".version-chip-dot");
      await expect(chipDot, `version-chip-dot của item ${i}`).toHaveCount(1);
      const chipDotColor = await chipDot.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(chipDotColor, `version-chip-dot của item ${i} không trong suốt`).not.toBe("rgba(0, 0, 0, 0)");

      const name = (await item.locator('[data-testid="version-name"]').textContent())?.trim() ?? "";
      expect(name, `version-name của item ${i} khác rỗng`).not.toBe("");

      const meta = (await item.locator('[data-testid="version-meta"]').textContent())?.trim() ?? "";
      const parts = meta.split("·").map((p) => p.trim());
      expect(parts.length, `version-meta của item ${i} phải có người tạo · thời điểm`).toBeGreaterThanOrEqual(2);
      expect(parts[0], `phần người tạo của item ${i}`).not.toBe("");
      expect(parts[1], `phần thời điểm của item ${i}`).not.toBe("");
    }

    // Đúng một mục "Đang mở" — bản đang mở sau tải = mới nhất = published.
    const openItems = drawer.locator('[data-testid="version-open"]');
    await expect(openItems).toHaveCount(1);
    await expect(openItems).toHaveText("Đang mở");
    const openItem = drawer.locator(
      `li[data-testid="version-item"][data-version-id="${VERSION_MAIN_PUBLISHED}"]`,
    );
    await expect(openItem.locator('[data-testid="version-open"]')).toHaveCount(1);

    // Chọn bản archived ở version-select — version-open chuyển theo.
    await page
      .locator('select[data-testid="version-select"]')
      .selectOption({ value: VERSION_MAIN_ARCHIVED });
    // v1 (archived) có đúng 3 node theo dữ liệu giả lập của fixture này.
    await expect(page.locator(".react-flow__node")).toHaveCount(3);

    await expect(openItems).toHaveCount(1);
    await expect(openItems).toHaveText("Đang mở");
    const archivedItem = drawer.locator(
      `li[data-testid="version-item"][data-version-id="${VERSION_MAIN_ARCHIVED}"]`,
    );
    await expect(archivedItem.locator('[data-testid="version-open"]')).toHaveCount(1);
    await expect(openItem.locator('[data-testid="version-open"]')).toHaveCount(0);

    expect(pageErrors, "0 sự kiện pageerror").toEqual([]);
    expect(consoleErrors, "0 console error").toEqual([]);
  });

  test("TC-FLOW-029 (CR 5) — --sans mọi nơi trừ version-select; version-select nay --mono tabular-nums; không nền ButtonFace", async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];
    listenErrors(page, pageErrors, consoleErrors);

    const sans = await (async () => {
      await openNumbers(page);
      return resolvedVar(page, "font-family", "--sans");
    })();

    // Màn 1 — số đầu số: number-dialog mở. Không version-select ở màn này.
    await page.locator('[data-testid="number-create"]').click();
    await expect(page.locator('dialog[data-testid="number-dialog"]')).toBeVisible();

    const nativeButtonBg = await nativeButtonBackground(page);

    await checkSansAndButtons(page, sans, nativeButtonBg, "#/numbers (dialog mở)");
    await checkMono(page, '[data-testid="number-value"]', "#/numbers number-value");
    await checkMono(page, '[data-testid="number-node-count"]', "#/numbers number-node-count");

    // Màn 2 — trình dựng (điều hướng thẳng, dialog đóng theo khi rời trang).
    // AC-41 (sửa CR 5): version-select không còn thuộc phép đo --sans, nay
    // --mono với tabular-nums.
    await openBuilder(page);
    await checkSansAndButtons(page, sans, nativeButtonBg, "trình dựng");
    await checkMono(page, '[data-testid="builder-number"]', "builder-number");
    await checkMono(page, '[data-testid="canvas-status"]', "canvas-status");
    await checkMono(page, '[data-testid="dirty-status"]', "dirty-status");
    await checkMono(page, 'select[data-testid="version-select"]', "version-select (trình dựng)");

    // Màn 3 — drawer phiên bản.
    await page.locator('button[data-testid="versions-open"]').click();
    await expect(page.locator('aside[data-testid="versions-drawer"]')).toBeVisible();
    await checkSansAndButtons(page, sans, nativeButtonBg, "drawer phiên bản");
    await checkMono(page, '[data-testid="version-code"]', "version-code");
    await checkMono(page, 'select[data-testid="version-select"]', "version-select (drawer)");

    expect(pageErrors, "0 sự kiện pageerror").toEqual([]);
    expect(consoleErrors, "0 console error").toEqual([]);
  });
});

async function checkSansAndButtons(
  page: Page,
  sans: string,
  nativeButtonBg: string,
  screenLabel: string,
) {
  for (const selector of ["body", "h1", "h2", "button", "input", "select"]) {
    const els = page.locator(selector);
    const count = await els.count();
    for (let i = 0; i < count; i += 1) {
      const el = els.nth(i);
      if (!(await el.isVisible())) continue;
      // AC-41 (sửa CR 5): version-select không còn thuộc phép đo --sans —
      // nó nay dùng --mono, kiểm riêng bằng checkMono.
      const testid = await el.getAttribute("data-testid");
      if (testid === "version-select") continue;
      const font = await el.evaluate((node) => getComputedStyle(node).fontFamily);
      expect(font, `${screenLabel}: ${selector}[${i}] font-family phải bằng --sans`).toBe(sans);
    }
  }

  const buttons = page.locator("button");
  const buttonCount = await buttons.count();
  for (let i = 0; i < buttonCount; i += 1) {
    const btn = buttons.nth(i);
    if (!(await btn.isVisible())) continue;
    const bg = await btn.evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(bg, `${screenLabel}: button[${i}] không được nền mặc định ButtonFace`).not.toBe(nativeButtonBg);
  }
}

async function checkMono(page: Page, selector: string, label: string) {
  const els = page.locator(selector);
  const count = await els.count();
  expect(count, `${label} phải có ít nhất 1 phần tử để đo`).toBeGreaterThan(0);
  const mono = await resolvedVar(page, "font-family", "--mono");
  for (let i = 0; i < count; i += 1) {
    const el = els.nth(i);
    if (!(await el.isVisible())) continue;
    const font = await el.evaluate((node) => getComputedStyle(node).fontFamily);
    expect(font, `${label}[${i}] font-family phải bằng --mono`).toBe(mono);
    const variant = await el.evaluate((node) => getComputedStyle(node).fontVariantNumeric);
    expect(variant, `${label}[${i}] font-variant-numeric phải chứa tabular-nums`).toContain("tabular-nums");
  }
}

/**
 * TC-FLOW-034 — không có phép đo tự động ("Automation: không — người xác
 * nhận", 4-testcases.md). Test này chỉ dựng ba màn hình ở cỡ 1440×900 và
 * lưu ảnh vào test-results/tc-flow-034/ cho user đối chiếu bằng mắt với ảnh
 * bản dựng thử; nó xác nhận trang render sạch (0 pageerror/console error)
 * chứ không tự chấm hai ảnh "giống nhau".
 */
test.describe("chrome-visual — ảnh nghiệm thu TC-FLOW-034", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("TC-FLOW-034 — chụp numbers.png, builder.png, drawer.png 1440x900", async ({ page }) => {
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];
    listenErrors(page, pageErrors, consoleErrors);

    await openNumbers(page);
    await expect(page.locator('[data-testid="number-row"]').first()).toBeVisible();
    await page.screenshot({ path: "test-results/tc-flow-034/numbers.png", fullPage: false });

    await openBuilder(page);
    await page.screenshot({ path: "test-results/tc-flow-034/builder.png", fullPage: false });

    await page.locator('button[data-testid="versions-open"]').click();
    await expect(page.locator('aside[data-testid="versions-drawer"]')).toBeVisible();
    await page.screenshot({ path: "test-results/tc-flow-034/drawer.png", fullPage: false });

    expect(pageErrors, "0 sự kiện pageerror").toEqual([]);
    expect(consoleErrors, "0 console error").toEqual([]);
  });
});
