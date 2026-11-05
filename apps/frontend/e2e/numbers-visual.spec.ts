import { expect, test, type Page, type Locator } from "@playwright/test";

/**
 * AC-33 / TC-PBX-011 — bảng đầu số theo bản dựng thử (`IVR Builder v3.dc.html`
 * dòng 143-239, 1548-1575; lot-brief lô 8). Change Request 4 mục 4.2 xếp
 * *Bỏ* cột/thẻ "Cuộc gọi 24h" và cột Hành động — không được dựng.
 *
 * Dữ liệu giả lập gốc (id gõ cứng, xem `e2e/numbers.spec.ts`, `reload.spec.ts`,
 * `versions.spec.ts` — không import `src/data/mock.ts`):
 *   - 2 đầu số: `1900123456` (DID_HOTLINE, có publishedVersionId) và
 *     `0283456789` (DID_FRESH, chưa gán kịch bản).
 *   - FLOW_MAIN có 2 phiên bản ban đầu: 1 published (v2, 7 node), 1 archived — 0 draft.
 *   => total=2, active=1, drafts=0 lúc khởi động.
 *
 * Quy ước DOM cộng thêm cho lô 8 (lot-brief §Quy ước chung test ↔ code):
 *   number-stat[data-stat="total|active|drafts"] > number-stat-value
 *   number-version, number-node-count, number-draft, number-status > status-dot
 *   Bảng 4 cột: Đầu số, Nhà mạng, Kịch bản, Trạng thái.
 *   Ô Đầu số: span.num[number-value] + div[number-flow] cùng một td.
 *   Ô Nhà mạng: number-provider, number-kind.
 *
 * Quy ước so "bằng --x" (AC-27…37, lot-brief dòng 30): giá trị đã tính của một
 * phần tử dò mang `<prop>: var(--x)`, KHÔNG so chuỗi thô đọc trực tiếp từ
 * `document.documentElement` (hai serialize khác định dạng dù cùng ngữ nghĩa —
 * xem test-report.prev.md / code-report.prev.md vòng 1).
 */
const FLOW_MAIN_ID = "5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d401";
const DID_HOTLINE_ID = "5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d421";
const DID_FRESH_ID = "5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d422";
const BASE_NODE_COUNT = 7;

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

/**
 * Giá trị CSS đã tính của một phần tử dò mang `<cssProp>: var(<varName>)`.
 * Dùng cho mọi so sánh "bằng --x" theo quy ước AC-27…37 — không đọc thô
 * `document.documentElement`.
 */
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

test.describe("numbers-visual", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("TC-PBX-011 — tiêu đề, mô tả, ba thẻ thống kê đúng số và nhãn, không có Cuộc gọi 24h", async ({ page }) => {
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];
    listenErrors(page, pageErrors, consoleErrors);

    await openNumbers(page);

    await expect(page.locator('[data-testid="numbers-screen"] h1')).toHaveText("Quản lý đầu số");
    await expect(page.locator('[data-testid="numbers-screen"] h1 + p')).not.toHaveText("");

    const stats = page.locator('[data-testid="number-stat"]');
    await expect(stats).toHaveCount(3);

    const expected: Record<string, { value: string; label: string }> = {
      total: { value: "2", label: "Tổng đầu số" },
      active: { value: "1", label: "Đang hoạt động" },
      drafts: { value: "0", label: "Bản nháp chờ publish" },
    };
    for (const [stat, { value, label }] of Object.entries(expected)) {
      const card = page.locator(`[data-testid="number-stat"][data-stat="${stat}"]`);
      await expect(card).toHaveCount(1);
      await expect(card.locator('[data-testid="number-stat-value"]')).toHaveText(value);
      await expect(card).toContainText(label);
    }

    await expect(page.locator('[data-testid="numbers-screen"]')).not.toContainText("Cuộc gọi 24h");
    await expect(page.locator('[data-testid="numbers-screen"] th', { hasText: "Cuộc gọi 24h" })).toHaveCount(0);

    const createText = (await page.locator('[data-testid="number-create"]').textContent())
      ?.replace(/\s+/g, " ")
      .trim();
    expect(createText, "chữ nút number-create").toBe("+ Thêm");

    const hints: Record<string, string> = {
      total: "Đang cấu hình trên hệ thống",
      active: "Có phiên bản đang chạy thật",
      drafts: "Cần review trước khi phát hành",
    };
    for (const [stat, hint] of Object.entries(hints)) {
      const card = page.locator(`[data-testid="number-stat"][data-stat="${stat}"]`);
      await expect(card.locator('[data-testid="number-stat-hint"]'), `number-stat-hint của ${stat}`).toHaveText(hint);
    }

    expect(pageErrors, "0 sự kiện pageerror").toEqual([]);
    expect(consoleErrors, "0 console error").toEqual([]);
  });

  test("bảng 4 cột — thead đúng Đầu số, Nhà mạng, Kịch bản, Trạng thái; number-provider khác rỗng, khác — (không mã TC, quy ước lô 8 / CR 4.2 Giữ)", async ({
    page,
  }) => {
    await openNumbers(page);

    const headers = page.locator('[data-testid="numbers-screen"] thead th');
    await expect(headers).toHaveText(["Đầu số", "Nhà mạng", "Kịch bản", "Trạng thái"]);

    for (const didId of [DID_HOTLINE_ID, DID_FRESH_ID]) {
      const provider = page.locator(`[data-testid="number-row"][data-did-id="${didId}"] [data-testid="number-provider"]`);
      const text = (await provider.textContent())?.trim() ?? "";
      expect(text).not.toBe("");
      expect(text).not.toBe("—");
    }

    // AC-33, review BLOCKING 1 — mỗi td phải nằm đúng cột (x, width) của thead th
    // tương ứng (±1px). Đếm td trước: ô ẩn danh (vd Cuộc gọi 24h/Hành động còn sót)
    // đổi bố cục hộp mà không đổi số cột hiển thị — phải bắt được bằng toHaveCount.
    const headerBoxes = await headers.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, width: r.width };
      }),
    );
    expect(headerBoxes).toHaveLength(4);

    for (const didId of [DID_HOTLINE_ID, DID_FRESH_ID]) {
      const row = page.locator(`[data-testid="number-row"][data-did-id="${didId}"]`);
      const tds = row.locator("td");
      await expect(tds, `số td của dòng ${didId}`).toHaveCount(4);
      const tdBoxes = await tds.evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, width: r.width };
        }),
      );
      for (let i = 0; i < 4; i++) {
        expect(Math.abs(tdBoxes[i].x - headerBoxes[i].x), `td[${i}].x của dòng ${didId} lệch cột header`).toBeLessThanOrEqual(1);
        expect(Math.abs(tdBoxes[i].width - headerBoxes[i].width), `td[${i}].width của dòng ${didId} lệch cột header`).toBeLessThanOrEqual(1);
      }
    }
  });

  test("TC-PBX-011 — mỗi dòng: số --mono, number-flow cùng ô với number-value, trạng thái có chấm màu khác trong suốt", async ({
    page,
  }) => {
    await openNumbers(page);
    const mono = await resolvedVar(page, "font-family", "--mono");
    const warnSoftRgb = await resolvedVar(page, "background-color", "--warn-soft");
    const okSoftRgb = await resolvedVar(page, "background-color", "--ok-soft");

    const tabularTestIds = ["number-value", "number-node-count", "number-version"];

    for (const didId of [DID_HOTLINE_ID, DID_FRESH_ID]) {
      const row = page.locator(`[data-testid="number-row"][data-did-id="${didId}"]`);

      const valueFont = await row.locator('[data-testid="number-value"]').evaluate((el) => getComputedStyle(el).fontFamily);
      expect(valueFont, `number-value font-family của dòng ${didId}`).toBe(mono);

      for (const testId of tabularTestIds) {
        const variant = await row
          .locator(`[data-testid="${testId}"]`)
          .evaluate((el) => getComputedStyle(el).fontVariantNumeric);
        expect(variant, `${testId} font-variant-numeric của dòng ${didId}`).toContain("tabular-nums");
      }

      const valueCell: Locator = row.locator("td", { has: page.locator('[data-testid="number-value"]') });
      await expect(valueCell.locator('[data-testid="number-flow"]'), `number-flow cùng td với number-value ở dòng ${didId}`).toHaveCount(1);

      const dot = row.locator('[data-testid="number-status"] [data-testid="status-dot"]');
      await expect(dot).toHaveCount(1);
      const dotColor = await dot.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(dotColor, `status-dot của dòng ${didId} không trong suốt`).not.toBe("rgba(0, 0, 0, 0)");
    }

    const statValues = page.locator('[data-testid="number-stat-value"]');
    const statCount = await statValues.count();
    expect(statCount).toBe(3);
    for (let i = 0; i < statCount; i++) {
      const variant = await statValues.nth(i).evaluate((el) => getComputedStyle(el).fontVariantNumeric);
      expect(variant, `number-stat-value[${i}] font-variant-numeric`).toContain("tabular-nums");
    }

    const hotlineRow = page.locator(`[data-testid="number-row"][data-did-id="${DID_HOTLINE_ID}"]`);
    await expect(hotlineRow.locator('[data-testid="number-version"]')).toHaveText("v2");
    await expect(hotlineRow.locator('[data-testid="number-node-count"]')).toHaveText(`${BASE_NODE_COUNT} node`);
    await expect(hotlineRow.locator('[data-testid="number-draft"]')).toHaveCount(0);
    await expect(hotlineRow.locator('[data-testid="number-status"]')).toHaveText("Hoạt động");
    const hotlineStatusBg = await hotlineRow
      .locator('[data-testid="number-status"]')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(hotlineStatusBg, "nền number-status dòng hotline bằng --ok-soft").toBe(okSoftRgb);

    const freshRow = page.locator(`[data-testid="number-row"][data-did-id="${DID_FRESH_ID}"]`);
    const freshVersion = freshRow.locator('[data-testid="number-version"]');
    await expect(freshVersion).toHaveText("chưa publish");
    const freshVersionBg = await freshVersion.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(freshVersionBg).toBe(warnSoftRgb);
    await expect(freshRow.locator('[data-testid="number-node-count"]')).toHaveText("—");
    await expect(freshRow.locator('[data-testid="number-status"]')).toHaveText("Nháp");
    const freshStatusBg = await freshRow
      .locator('[data-testid="number-status"]')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(freshStatusBg, "nền number-status dòng fresh bằng --warn-soft").toBe(warnSoftRgb);
  });

  test("gõ vào number-search chỉ còn dòng khớp, thẻ thống kê không đổi theo bộ lọc, không khớp thì hiện thông báo rỗng, xoá thì đủ lại", async ({
    page,
  }) => {
    await openNumbers(page);
    const rows = page.locator('[data-testid="number-row"]');
    const search = page.locator('[data-testid="number-search"]');
    const totalStat = page.locator('[data-testid="number-stat"][data-stat="total"] [data-testid="number-stat-value"]');
    const activeStat = page.locator('[data-testid="number-stat"][data-stat="active"] [data-testid="number-stat-value"]');

    await search.fill("1900123456");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute("data-did-id", DID_HOTLINE_ID);

    await search.fill("CHĂM SÓC");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute("data-did-id", DID_HOTLINE_ID);
    await expect(totalStat, "number-stat total không đổi theo bộ lọc").toHaveText("2");
    await expect(activeStat, "number-stat active không đổi theo bộ lọc").toHaveText("1");

    await search.fill("zzz");
    await expect(rows).toHaveCount(0);
    await expect(page.locator('[data-testid="numbers-filter-empty"]')).toHaveText("Không có đầu số nào khớp bộ lọc");

    await search.fill("");
    await expect(rows).toHaveCount(2);
    await expect(page.locator('[data-testid="numbers-filter-empty"]')).toHaveCount(0);
  });

  test("lưu nháp ở trình dựng rồi bấm nav-numbers quay lại (không tải lại): drafts=1, dòng hotline có number-draft", async ({
    page,
  }) => {
    await openNumbers(page);

    await page.goto(`/#/flows/${FLOW_MAIN_ID}`);
    await expect(page.locator(".react-flow__node")).toHaveCount(BASE_NODE_COUNT);

    const item = page.locator('[data-testid="palette-item"][data-node-type="hangup"]');
    await item.dragTo(page.locator(".react-flow__pane"));
    await page.locator('[data-testid="save-draft"]').click();
    await expect(page.locator('[data-testid="save-status"]')).toHaveAttribute("data-state", "saved", {
      timeout: 3000,
    });

    await page.locator('a[data-testid="nav-numbers"]').click();
    await expect(page.locator('[data-testid="numbers-screen"]')).toBeVisible();

    const draftsCard = page.locator('[data-testid="number-stat"][data-stat="drafts"] [data-testid="number-stat-value"]');
    await expect(draftsCard).toHaveText("1");

    const hotlineRow = page.locator(`[data-testid="number-row"][data-did-id="${DID_HOTLINE_ID}"]`);
    await expect(hotlineRow.locator('[data-testid="number-draft"]')).toHaveCount(1);
  });
});
