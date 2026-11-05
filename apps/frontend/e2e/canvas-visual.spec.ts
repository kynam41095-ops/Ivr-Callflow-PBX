import { expect, test as base, type Locator, type Page } from "@playwright/test";

/**
 * Bắt pageerror/console error trên mọi test của file này (quy tắc test e2e
 * chung của squad) — auto fixture, không cần lặp lại trong từng test.
 */
const test = base.extend<{ _captureConsoleErrors: void }>({
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

/**
 * AC-28…AC-32 (lô 7) — thẻ node, cạnh, nền chấm, controls, minimap phải
 * đúng hình dạng bản dựng thử, bằng cơ chế gốc của `@xyflow/react`.
 *
 * Dùng lại kịch bản `FLOW_MAIN` (id gõ cứng, xem `src/data/mock.ts`),
 * phiên bản mới nhất — bảy node: start, schedule, menu, play-info,
 * play-closed, queue, hangup — cùng quy ước với `builder-canvas.spec.ts`
 * / `builder-validate.spec.ts`. Không import `mock.ts`.
 *
 * Quy ước chung của lô: "bằng --x" = bằng giá trị đã tính của một phần tử
 * dò mang thuộc tính CSS = var(--x), không so chuỗi thô (xem `tokens.spec.ts`
 * và lot-brief mục AC-27…AC-37). `<loại>` theo §3.9: menu → dtmf,
 * schedule → time, còn lại giữ tên loại node.
 *
 * Quy ước DOM theo lot-brief lô 7 "Quy ước chung test ↔ code":
 *   node-card    [data-testid="node-card"] bên trong .react-flow__node
 *   node-bar     [data-testid="node-bar"]
 *   node-icon    [data-testid="node-icon"]
 *   node-title   [data-testid="node-title"]
 *   node-summary [data-testid="node-summary"]
 *   node-branch  [data-testid="node-branch"][data-handleid][data-state] — mỗi
 *                hàng chứa handle-label, node-dot, .react-flow__handle.source
 *   node-dot     [data-testid="node-dot"]
 *   node-foot    [data-testid="node-foot"]
 *   handle-label [data-testid="handle-label"][data-handleid] (đã có từ lô 5/6)
 */

const FLOW_URL = "/#/flows/5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d401";
const EXPECTED_NODE_COUNT = 7;

// §3.9 — ánh xạ loại node ứng dụng sang hậu tố token --n-<loại>-*.
const TOKEN_TYPE: Record<string, string> = {
  start: "start",
  play: "play",
  menu: "dtmf",
  queue: "queue",
  hangup: "hangup",
  schedule: "time",
};

// Nhãn nhánh đúng bảng §3.9 (TC-CALL-023) — chỉ các loại có nhánh nguồn.
const EXPECTED_BRANCH_LABELS: Record<string, string[]> = {
  start: ["Cuộc gọi vào", "Nhánh dự phòng"],
  play: ["Phát xong"],
  menu: ["Phím 1", "Phím 2", "Không bấm phím", "Sai phím"],
  schedule: ["Trong giờ", "Ngoài giờ"],
};

// node-summary gõ cứng theo lot-brief (nguồn src/data/mock.ts:44,52,69,131 —
// không đọc file đó, chỉ chép nguyên chữ đã chốt trong "Việc cho vai test").
const EXPECTED_SUMMARY_BY_ID: Record<string, string> = {
  "play-info": "Giới thiệu dịch vụ",
  menu: "Lời nhắc menu chính · chờ 5s",
  queue: "Hàng đợi bán hàng",
  start: "—",
  hangup: "—",
};

async function openBuilder(page: Page) {
  await page.goto(FLOW_URL);
  await expect(page.locator(".react-flow__node")).toHaveCount(EXPECTED_NODE_COUNT);
}

/** Giá trị CSS đã tính của một phần tử dò tạm, không so chuỗi thô var(). */
async function computedValue(page: Page, cssText: string, prop: string): Promise<string> {
  return page.evaluate(
    ({ cssText: css, prop: property }) => {
      const probe = document.createElement("div");
      probe.style.cssText = css;
      document.body.appendChild(probe);
      const value = getComputedStyle(probe).getPropertyValue(property);
      probe.remove();
      return value;
    },
    { cssText, prop },
  );
}

async function computedVar(page: Page, varName: string, prop: string): Promise<string> {
  return computedValue(page, `${prop}: var(${varName})`, prop);
}

/** Loại node đọc từ class `.react-flow__node-<type>` do @xyflow/react gắn. */
async function nodeType(node: Locator): Promise<string> {
  const cls = (await node.getAttribute("class")) ?? "";
  const match = cls.match(/react-flow__node-(\S+)/);
  expect(match, `không tìm được react-flow__node-<type> trong class "${cls}"`).toBeTruthy();
  return match![1];
}

/**
 * Kích thước hộp bố cục CSS (used value, px) — không dùng boundingBox() ở
 * đây vì canvas có thể không ở thu phóng 100% (fitView), boundingBox() sẽ
 * nhân thêm hệ số zoom của `.react-flow__viewport`. Quy ước AC-27…AC-37:
 * "Kích thước = hộp bố cục CSS (tương đương thu phóng 1)".
 */
async function layoutSize(el: Locator): Promise<{ width: number; height: number }> {
  return el.evaluate((e) => {
    const cs = getComputedStyle(e);
    return { width: parseFloat(cs.width), height: parseFloat(cs.height) };
  });
}

async function findBranchRowByLabel(node: Locator, label: string): Promise<Locator> {
  const rows = node.locator('[data-testid="node-branch"]');
  const count = await rows.count();
  for (let i = 0; i < count; i += 1) {
    const text = ((await rows.nth(i).locator('[data-testid="handle-label"]').textContent()) ?? "").trim();
    if (text === label) return rows.nth(i);
  }
  throw new Error(`không tìm thấy hàng nhánh có nhãn "${label}"`);
}

/**
 * Tìm cạnh SVG xuất phát gần một điểm nối nguồn cho trước, bằng toạ độ
 * màn hình thật (getPointAtLength + getScreenCTM) — không đoán id cạnh.
 */
/** Cạnh SVG gần một điểm nối nhất, kèm khoảng cách — null nếu canvas không có cạnh nào. */
async function findClosestEdge(page: Page, handle: Locator): Promise<{ edge: Locator; dist: number } | null> {
  const handleBox = await handle.boundingBox();
  if (!handleBox) return null;
  const targetX = handleBox.x + handleBox.width / 2;
  const targetY = handleBox.y + handleBox.height / 2;

  const paths = page.locator(".react-flow__edge-path");
  const count = await paths.count();

  let bestIndex = -1;
  let bestDist = Infinity;
  for (let i = 0; i < count; i += 1) {
    const point = await paths.nth(i).evaluate((el) => {
      const path = el as unknown as SVGPathElement;
      const p = path.getPointAtLength(0);
      const ctm = path.getScreenCTM();
      if (!ctm) return null;
      const t = p.matrixTransform(ctm);
      return { x: t.x, y: t.y };
    });
    if (!point) continue;
    const dist = Math.hypot(point.x - targetX, point.y - targetY);
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = i;
    }
  }
  if (bestIndex < 0) return null;
  return { edge: paths.nth(bestIndex), dist: bestDist };
}

/** Trả `null` nếu điểm nối chưa có cạnh (chưa nối). */
async function tryEdgeFromHandle(page: Page, handle: Locator): Promise<Locator | null> {
  const found = await findClosestEdge(page, handle);
  if (!found || found.dist >= 20) return null;
  return found.edge;
}

test.describe("canvas-visual", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("TC-CALL-022 — mỗi node-card đúng hình dạng bản dựng thử (284px, thanh 6px, icon tròn 28px, tên uppercase, tóm tắt --mono, hàng nhánh 34px)", async ({
    page,
  }) => {
    await openBuilder(page);

    const expectedMonoFont = await computedValue(page, "font-family: var(--mono)", "font-family");
    const iconPathDByType: Record<string, string> = {};

    const nodes = page.locator(".react-flow__node");
    const count = await nodes.count();
    for (let i = 0; i < count; i += 1) {
      const node = nodes.nth(i);
      const nodeId = await node.getAttribute("data-id");
      const type = await nodeType(node);
      const tokenType = TOKEN_TYPE[type];
      expect(tokenType, `loại node "${type}" chưa có trong bảng ánh xạ §3.9`).toBeTruthy();
      const expectedTypeColor = await computedVar(page, `--n-${tokenType}-b`, "background-color");

      const card = node.locator('[data-testid="node-card"]');
      await expect(card, `node ${type} phải có node-card`).toHaveCount(1);
      const cardSize = await layoutSize(card);
      expect(cardSize.width, `node-card của ${type} phải rộng 284px`).toBeCloseTo(284, 0);

      const bar = card.locator('[data-testid="node-bar"]');
      await expect(bar).toHaveCount(1);
      const barSize = await layoutSize(bar);
      expect(barSize.height, `node-bar của ${type} phải cao 6px`).toBeCloseTo(6, 0);
      const barColor = await bar.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(barColor, `node-bar của ${type} phải nền --n-${tokenType}-b`).toBe(expectedTypeColor);

      const icon = card.locator('[data-testid="node-icon"]');
      await expect(icon).toHaveCount(1);
      const iconSize = await layoutSize(icon);
      expect(iconSize.width, `node-icon của ${type} phải rộng 28px`).toBeCloseTo(28, 0);
      expect(iconSize.height, `node-icon của ${type} phải cao 28px`).toBeCloseTo(28, 0);
      const iconStyle = await icon.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { borderRadius: parseFloat(cs.borderRadius), borderColor: cs.borderColor };
      });
      expect(
        iconStyle.borderRadius,
        `node-icon của ${type} phải là hình tròn (border-radius ~ nửa chiều rộng)`,
      ).toBeGreaterThanOrEqual((iconSize.width - 4) / 2);
      const expectedTypeBorderColor = await computedVar(page, `--n-${tokenType}-b`, "border-color");
      expect(iconStyle.borderColor, `node-icon của ${type} phải viền --n-${tokenType}-b`).toBe(
        expectedTypeBorderColor,
      );

      const iconSvg = icon.locator("svg");
      await expect(iconSvg, `node-icon của ${type} phải chứa đúng 1 svg`).toHaveCount(1);
      const firstPathD = await iconSvg.locator("path").first().getAttribute("d");
      expect(firstPathD, `node-icon của ${type} phải có ít nhất 1 path với thuộc tính d`).toBeTruthy();
      iconPathDByType[type] = firstPathD!;

      const title = card.locator('[data-testid="node-title"]');
      await expect(title).toHaveCount(1);
      const titleStyle = await title.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { textTransform: cs.textTransform, fontWeight: Number(cs.fontWeight) };
      });
      expect(titleStyle.textTransform, `node-title của ${type} phải uppercase`).toBe("uppercase");
      expect(titleStyle.fontWeight, `node-title của ${type} phải đậm >= 600`).toBeGreaterThanOrEqual(600);

      const summary = card.locator('[data-testid="node-summary"]');
      await expect(summary).toHaveCount(1);
      const summaryFont = await summary.evaluate((el) => getComputedStyle(el).fontFamily);
      expect(summaryFont, `node-summary của ${type} phải chữ --mono`).toBe(expectedMonoFont);
      if (nodeId && EXPECTED_SUMMARY_BY_ID[nodeId] !== undefined) {
        const summaryText = ((await summary.textContent()) ?? "").trim();
        expect(summaryText, `node-summary của node "${nodeId}" phải đúng chữ tra từ danh mục`).toBe(
          EXPECTED_SUMMARY_BY_ID[nodeId],
        );
      }

      const branchRows = card.locator('[data-testid="node-branch"]');
      const sourceHandles = node.locator(".react-flow__handle.source");
      const branchCount = await branchRows.count();
      const handleCount = await sourceHandles.count();
      expect(branchCount, `số node-branch của ${type} phải bằng số điểm nối nguồn`).toBe(handleCount);
      for (let j = 0; j < branchCount; j += 1) {
        const rowSize = await layoutSize(branchRows.nth(j));
        expect(rowSize.height, `hàng nhánh ${j} của ${type} phải cao 34px`).toBeCloseTo(34, 0);
      }
    }

    const distinctPathD = new Set(Object.values(iconPathDByType));
    expect(
      distinctPathD.size,
      `d của path đầu phải khác nhau giữa sáu loại (thấy: ${JSON.stringify(iconPathDByType)})`,
    ).toBe(Object.keys(iconPathDByType).length);
  });

  test("TC-CALL-023 — nhãn nhánh không giao điểm nối, không bị cắt, chữ đúng bảng §3.9", async ({ page }) => {
    await openBuilder(page);

    const nodes = page.locator(".react-flow__node");
    const count = await nodes.count();
    for (let i = 0; i < count; i += 1) {
      const node = nodes.nth(i);
      const type = await nodeType(node);
      const expectedLabels = EXPECTED_BRANCH_LABELS[type];
      if (!expectedLabels) continue; // queue, hangup: không có hàng nhánh

      const rows = node.locator('[data-testid="node-branch"]');
      await expect(rows, `${type} phải có đúng ${expectedLabels.length} hàng nhánh`).toHaveCount(
        expectedLabels.length,
      );

      const cardBox = await node.locator('[data-testid="node-card"]').boundingBox();
      expect(cardBox, `${type} phải đo được hộp bao node-card`).toBeTruthy();

      const rowCount = await rows.count();
      const actualLabels: string[] = [];
      for (let j = 0; j < rowCount; j += 1) {
        const row = rows.nth(j);
        const label = row.locator('[data-testid="handle-label"]');
        const handle = row.locator(".react-flow__handle.source");

        const handleEdgeBox = await handle.boundingBox();
        expect(handleEdgeBox, `hàng ${j} của ${type} phải đo được hộp bao điểm nối`).toBeTruthy();
        if (handleEdgeBox && cardBox) {
          expect(
            handleEdgeBox.x + handleEdgeBox.width,
            `hàng ${j} của ${type}: điểm nối nguồn phải nằm ngoài mép phải node-card, không đè lên thẻ`,
          ).toBeGreaterThan(cardBox.x + cardBox.width);
        }

        const labelBox = await label.boundingBox();
        const handleBox = await handle.boundingBox();
        expect(labelBox && handleBox, `hàng ${j} của ${type} phải đo được cả hai hộp bao`).toBeTruthy();
        if (labelBox && handleBox) {
          const intersects =
            labelBox.x < handleBox.x + handleBox.width &&
            labelBox.x + labelBox.width > handleBox.x &&
            labelBox.y < handleBox.y + handleBox.height &&
            labelBox.y + labelBox.height > handleBox.y;
          expect(intersects, `hàng ${j} của ${type}: nhãn giao chấm điểm nối`).toBe(false);
        }

        const { scrollWidth, clientWidth } = await label.evaluate((el) => ({
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        }));
        // Bẫy đỏ rỗng nêu ở lot-brief: một `span` inline có cả hai bằng 0,
        // scrollWidth <= clientWidth vẫn đúng dù không đo được gì thật.
        expect(clientWidth, `hàng ${j} của ${type}: handle-label phải là khối co giãn, không phải span inline`).toBeGreaterThan(0);
        expect(scrollWidth - clientWidth, `hàng ${j} của ${type}: nhãn bị cắt (scrollWidth > clientWidth)`).toBeLessThanOrEqual(0);

        actualLabels.push(((await label.textContent()) ?? "").trim());
      }

      expect(actualLabels.sort(), `nhãn nhánh của ${type} phải đúng bảng §3.9`).toEqual(
        [...expectedLabels].sort(),
      );
    }
  });

  test("TC-CALL-024 — trạng thái nhánh hiện trên thẻ: nối (--ok-dot), nhánh dự phòng luôn báo lỗi, nhánh trống báo cảnh báo, chân thẻ đếm đúng", async ({
    page,
  }) => {
    await openBuilder(page);

    // Phần 1 — node Phát lời thoại đã nối: chấm --ok-dot, không node-foot.
    const playNode = page.locator('.react-flow__node[data-id="play-info"]');
    await expect(playNode).toBeVisible();
    const playDot = playNode.locator('[data-testid="node-branch"] [data-testid="node-dot"]');
    await expect(playDot, "node play-info phải có đúng 1 hàng nhánh").toHaveCount(1);
    const expectedOkDot = await computedVar(page, "--ok-dot", "background-color");
    const actualPlayDotColor = await playDot.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(actualPlayDotColor, "chấm của node play-info phải màu --ok-dot").toBe(expectedOkDot);
    await expect(playNode.locator('[data-testid="node-foot"]')).toHaveCount(0);

    // Phần 2 — node Menu mới thả từ palette, thêm phím "1", không nối gì.
    const paletteMenu = page.locator('[data-testid="palette-item"][data-node-type="menu"]');
    await paletteMenu.dragTo(page.locator(".react-flow__pane"));
    const menuNodes = page.locator(".react-flow__node-menu");
    await expect(menuNodes).toHaveCount(2);
    const menuIds = await menuNodes.evaluateAll((els) => els.map((el) => el.getAttribute("data-id")));
    const newMenuId = menuIds.find((id) => id !== "menu");
    expect(newMenuId, "node menu mới phải có id khác node menu có sẵn").toBeTruthy();
    const newMenuNode = page.locator(`.react-flow__node-menu[data-id="${newMenuId}"]`);

    await newMenuNode.click();
    await expect(page.locator('[data-testid="inspector"]')).toBeVisible();
    // Lô 11 — choice-add tự chọn phím trống đầu tiên (1–9, 0, *, #), không
    // còn select riêng để chọn phím trước khi thêm (Quy ước chung lô 11).
    await page.locator('[data-field="choices"] [data-testid="choice-add"]').click();

    const rows = newMenuNode.locator('[data-testid="node-branch"]');
    await expect(rows, "node menu mới phải có 3 hàng: Phím 1, Không bấm phím, Sai phím").toHaveCount(3);

    const expectedErrColor = await computedValue(page, "color: var(--err)", "color");
    const expectedErrDot = await computedVar(page, "--err-dot", "background-color");
    const expectedWarnBd = await computedValue(page, "border-color: var(--warn-bd)", "border-color");
    const expectedWarnSoft = await computedVar(page, "--warn-soft", "background-color");

    for (const label of ["Không bấm phím", "Sai phím"]) {
      const row = await findBranchRowByLabel(newMenuNode, label);
      const labelEl = row.locator('[data-testid="handle-label"]');
      const dotEl = row.locator('[data-testid="node-dot"]');
      const labelColor = await labelEl.evaluate((el) => getComputedStyle(el).color);
      expect(labelColor, `hàng "${label}" phải chữ màu --err`).toBe(expectedErrColor);
      const dotColor = await dotEl.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(dotColor, `hàng "${label}" phải chấm màu --err-dot`).toBe(expectedErrDot);
    }

    const key1Row = await findBranchRowByLabel(newMenuNode, "Phím 1");
    const key1Dot = key1Row.locator('[data-testid="node-dot"]');
    const key1DotStyle = await key1Dot.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { background: cs.backgroundColor, borderColor: cs.borderColor };
    });
    expect(key1DotStyle.background, "chấm hàng Phím 1 (chưa nối) phải nền trong suốt").toBe("rgba(0, 0, 0, 0)");
    expect(key1DotStyle.borderColor, "chấm hàng Phím 1 (chưa nối) phải viền --warn-bd").toBe(expectedWarnBd);

    const foot = newMenuNode.locator('[data-testid="node-foot"]');
    await expect(foot, "node menu mới phải có node-foot").toHaveCount(1);
    const footBg = await foot.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(footBg, "node-foot phải nền --warn-soft").toBe(expectedWarnSoft);
    await expect(foot, 'node-foot phải ghi "3 nhánh chưa nối"').toContainText("3 nhánh chưa nối");
  });

  test("TC-FLOW-030 — cạnh thường theo màu node nguồn, cạnh từ nhánh dự phòng nét đứt màu --err-dot", async ({
    page,
  }) => {
    await openBuilder(page);

    const expectedErrDotColor = await computedValue(page, "color: var(--err-dot)", "color");
    const FALLBACK_HANDLE_IDS = new Set(["fallback", "timeout", "invalid"]);
    const seenFallbackIds = new Set<string>();
    const seenNormalTypes = new Set<string>();

    // Chromium tự chuẩn hoá "5 4" thành "5px, 4px" trong computed style —
    // parseFloat bỏ đơn vị, Number("5px") sẽ ra NaN nên không dùng Number.
    const toDashNumbers = (dasharray: string) =>
      dasharray
        .split(/[\s,]+/)
        .filter((s) => s.length > 0)
        .map((s) => parseFloat(s));

    const nodes = page.locator(".react-flow__node");
    const nodeCount = await nodes.count();
    for (let i = 0; i < nodeCount; i += 1) {
      const node = nodes.nth(i);
      const type = await nodeType(node);
      const sourceHandles = node.locator(".react-flow__handle.source");
      const handleCount = await sourceHandles.count();

      for (let j = 0; j < handleCount; j += 1) {
        const handle = sourceHandles.nth(j);
        const edge = await tryEdgeFromHandle(page, handle);
        if (!edge) continue; // điểm nối chưa có cạnh — không thuộc phạm vi test này

        const handleId = await handle.getAttribute("data-handleid");
        const style = await edge.evaluate((el) => {
          const cs = getComputedStyle(el);
          return {
            stroke: cs.stroke,
            strokeWidth: parseFloat(cs.strokeWidth),
            dasharray: cs.strokeDasharray,
            markerEnd: el.getAttribute("marker-end"),
          };
        });

        if (handleId && FALLBACK_HANDLE_IDS.has(handleId)) {
          expect(style.stroke, `cạnh từ handle "${handleId}" (node ${type}) phải màu --err-dot`).toBe(
            expectedErrDotColor,
          );
          expect(
            toDashNumbers(style.dasharray),
            `cạnh từ handle "${handleId}" (node ${type}) phải stroke-dasharray tương đương "5 4"`,
          ).toEqual([5, 4]);
          seenFallbackIds.add(handleId);
        } else {
          const tokenType = TOKEN_TYPE[type];
          expect(tokenType, `loại node "${type}" chưa có trong bảng ánh xạ §3.9`).toBeTruthy();
          const expectedColor = await computedValue(page, `color: var(--n-${tokenType}-b)`, "color");
          expect(style.stroke, `cạnh thường từ node ${type} phải màu --n-${tokenType}-b`).toBe(expectedColor);
          expect(style.strokeWidth, `cạnh thường từ node ${type} phải nét 1.8px`).toBeCloseTo(1.8, 1);
          expect(["none", ""], `cạnh thường từ node ${type} không được nét đứt`).toContain(style.dasharray);
          expect(style.markerEnd, `cạnh thường từ node ${type} phải có marker-end`).toBeTruthy();
          expect(style.markerEnd).not.toBe("none");
          seenNormalTypes.add(type);
        }
      }
    }

    // Không xanh rỗng: phải thực sự gặp cả hai loại nhánh dự phòng và cạnh
    // thường từ đủ bốn loại node nêu ở lot-brief.
    for (const id of ["timeout", "invalid"]) {
      expect(seenFallbackIds.has(id), `phải gặp ít nhất 1 cạnh xuất phát từ handle "${id}"`).toBe(true);
    }
    for (const t of ["start", "menu", "schedule", "play"]) {
      expect(seenNormalTypes.has(t), `phải gặp ít nhất 1 cạnh thường xuất phát từ node loại "${t}"`).toBe(true);
    }
  });

  test("TC-FLOW-031 — nền chấm 18px màu --grid, controls dưới phải, minimap dưới trái, số khối minimap đúng, zoom in tăng scale", async ({
    page,
  }) => {
    await openBuilder(page);

    const canvas = page.locator(".react-flow");
    const background = page.locator(".react-flow__background");
    await expect(background).toBeVisible();

    const viewport = page.locator(".react-flow__viewport");
    const scaleOf = () =>
      viewport.evaluate((el) => {
        const t = getComputedStyle(el).transform;
        if (t === "none") return 1;
        const match = t.match(/matrix\(([^,]+),/);
        return match ? parseFloat(match[1]) : 1;
      });

    const pattern = background.locator("pattern").first();
    await expect(pattern).toHaveCount(1);
    const patternWidth = await pattern.evaluate((el) => parseFloat(el.getAttribute("width") ?? "0"));
    const scaleBefore = await scaleOf();
    expect(patternWidth / scaleBefore, "bề rộng pattern chia scale phải bằng 18").toBeCloseTo(18, 0);

    const dotShape = background.locator("circle, path").first();
    await expect(dotShape).toHaveCount(1);
    const dotColor = await dotShape.evaluate((el) => getComputedStyle(el).fill);
    const expectedGridColor = await computedValue(page, "color: var(--grid)", "color");
    expect(dotColor, "chấm nền phải màu --grid").toBe(expectedGridColor);

    const controls = page.locator(".react-flow__controls");
    const minimap = page.locator(".react-flow__minimap");
    const canvasBox = await canvas.boundingBox();
    const controlsBox = await controls.boundingBox();
    const minimapBox = await minimap.boundingBox();
    expect(canvasBox && controlsBox && minimapBox, "phải đo được canvas, controls, minimap").toBeTruthy();
    if (canvasBox && controlsBox && minimapBox) {
      expect(controlsBox.x + controlsBox.width, "controls phải ở góc dưới phải").toBeGreaterThan(
        canvasBox.x + canvasBox.width - 40,
      );
      expect(controlsBox.y + controlsBox.height, "controls phải ở góc dưới phải").toBeGreaterThan(
        canvasBox.y + canvasBox.height - 40,
      );
      expect(minimapBox.x, "minimap phải ở góc dưới trái").toBeLessThan(canvasBox.x + 40);
      expect(minimapBox.y + minimapBox.height, "minimap phải ở góc dưới trái").toBeGreaterThan(
        canvasBox.y + canvasBox.height - 40,
      );
    }

    const minimapNodes = page.locator(".react-flow__minimap-node");
    await expect(minimapNodes, "số khối minimap phải bằng số node").toHaveCount(EXPECTED_NODE_COUNT);

    const nodeTypes = await page.locator(".react-flow__node").evaluateAll((els) =>
      els.map((el) => {
        const m = el.className.match(/react-flow__node-(\S+)/);
        return m ? m[1] : "";
      }),
    );
    // So sánh đa tập màu (một màu kỳ vọng cho mỗi node), không chỉ tập hợp,
    // để bắt được cả trường hợp một loại bị tô sai màu của loại khác.
    const expectedFills: string[] = [];
    for (const t of nodeTypes) {
      const tokenType = TOKEN_TYPE[t];
      expect(tokenType, `loại node "${t}" chưa có trong bảng ánh xạ §3.9`).toBeTruthy();
      expectedFills.push(await computedVar(page, `--n-${tokenType}-b`, "fill"));
    }
    const minimapFills = await minimapNodes.evaluateAll((els) => els.map((el) => getComputedStyle(el).fill));
    expect(
      [...minimapFills].sort(),
      "màu mỗi khối minimap phải đúng theo loại node (đa tập, không quan tâm thứ tự)",
    ).toEqual([...expectedFills].sort());

    await page.locator(".react-flow__controls-zoomin").click();
    await expect.poll(scaleOf, "bấm phóng to phải tăng scale").toBeGreaterThan(scaleBefore);
  });
});
