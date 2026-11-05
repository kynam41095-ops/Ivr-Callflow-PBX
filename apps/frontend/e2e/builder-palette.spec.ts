import { expect, test, type Page } from "@playwright/test";

/**
 * Lô 10 — AC-39 (TC-FLOW-035). Trình dựng mở kịch bản giả lập `FLOW_MAIN`
 * (id gõ cứng, cùng bộ id với các spec khác — xem `src/data/mock.ts`, không
 * import). Palette mặc định thu gọn mỗi lần dựng `BuilderScreen` (Quy ước
 * chung lô 10 trong lot-brief).
 */
const FLOW_URL = "/#/flows/5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d401";

const STEP_LABELS_BY_CODE: Record<string, string> = {
  ST: "Bắt đầu",
  PL: "Phát lời thoại",
  KB: "Menu phím bấm",
  QU: "Chuyển hàng đợi",
  HG: "Kết thúc",
  TM: "Điều kiện theo lịch",
};

async function openBuilder(page: Page) {
  await page.goto(FLOW_URL);
  await expect(page.locator(".react-flow__node").first()).toBeVisible();
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

function listenErrors(page: Page, pageErrors: Error[], consoleErrors: string[]) {
  page.on("pageerror", (err) => pageErrors.push(err));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
}

test.describe("builder-palette", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("TC-FLOW-035 — palette thu gọn 56px mặc định, sáu mã ST/PL/KB/QU/HG/TM, không chữ hiển thị, tooltip khi rê chuột", async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];
    listenErrors(page, pageErrors, consoleErrors);

    await openBuilder(page);

    const palette = page.locator('[data-testid="palette"]');
    await expect(palette).toHaveAttribute("data-state", "collapsed");
    const collapsedBox = await palette.boundingBox();
    if (!collapsedBox) throw new Error("không lấy được boundingBox của palette thu gọn");
    expect(Math.round(collapsedBox.width), "palette thu gọn rộng 56 px").toBe(56);

    const items = page.locator('[data-testid="palette-item"]');
    await expect(items).toHaveCount(6);

    const codes = (
      await page.locator('[data-testid="palette-item"] [data-testid="palette-code"]').allTextContents()
    )
      .map((t) => t.trim())
      .sort();
    expect(codes).toEqual(["HG", "KB", "PL", "QU", "ST", "TM"]);

    // Không chữ tên bước / tên nhóm nào hiển thị khi thu gọn.
    await expect(page.locator('[data-testid="palette-label"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="palette-group-name"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="palette-title"]')).toHaveCount(0);

    // Mỗi mục có aria-label bằng tên bước.
    const ariaLabels = (
      await items.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")))
    ).sort();
    expect(ariaLabels).toEqual(Object.values(STEP_LABELS_BY_CODE).sort());

    const toggle = page.locator('[data-testid="palette-toggle"]');
    await expect(toggle).toHaveAttribute("title", "Mở rộng thư viện node");
    await expect(toggle).toHaveAttribute("aria-label", "Mở rộng thư viện node");

    // Rê chuột lên mục "Bắt đầu": tooltip nền --fg, đúng tên bước, bên phải mục.
    const fg = await resolvedVar(page, "background-color", "--fg");
    const startItem = page.locator('[data-testid="palette-item"][data-node-type="start"]');
    await startItem.hover();
    const tooltip = page.locator('[data-testid="palette-tooltip"]');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveAttribute("role", "tooltip");
    await expect(tooltip).toHaveText("Bắt đầu");
    const tooltipBg = await tooltip.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(tooltipBg, "tooltip nền bằng --fg").toBe(fg);

    const itemBox = await startItem.boundingBox();
    const tooltipBox = await tooltip.boundingBox();
    if (!itemBox || !tooltipBox) throw new Error("không lấy được boundingBox của mục / tooltip");
    expect(
      tooltipBox.x,
      "cạnh trái tooltip ≥ cạnh phải mục — tooltip nằm bên phải mục",
    ).toBeGreaterThanOrEqual(itemBox.x + itemBox.width);

    // Rời chuột: tooltip ẩn.
    await page.mouse.move(2, 2);
    await expect(tooltip).toBeHidden();

    // Bấm toggle: mở rộng — 236 px, tiêu đề, tên nhóm, mã + tên bước, title đổi.
    await toggle.click();
    await expect(palette).toHaveAttribute("data-state", "expanded");
    const expandedBox = await palette.boundingBox();
    if (!expandedBox) throw new Error("không lấy được boundingBox của palette mở rộng");
    expect(Math.round(expandedBox.width), "palette mở rộng rộng 236 px").toBe(236);

    await expect(page.locator('[data-testid="palette-title"]')).toHaveText("Thư viện node");
    await expect(page.locator('[data-testid="palette-group-name"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="palette-label"]')).toHaveCount(6);
    await expect(toggle).toHaveAttribute("title", "Thu gọn thư viện node");
    await expect(toggle).toHaveAttribute("aria-label", "Thu gọn thư viện node");

    // Không ô nhập nào trong palette.
    await expect(page.locator('[data-testid="palette"] input')).toHaveCount(0);

    expect(pageErrors, "0 sự kiện pageerror").toEqual([]);
    expect(consoleErrors, "0 console error").toEqual([]);
  });

  test("TC-FLOW-035 — kéo một mục từ palette thu gọn thả vào canvas thêm đúng 1 node", async ({ page }) => {
    const pageErrors: Error[] = [];
    const consoleErrors: string[] = [];
    listenErrors(page, pageErrors, consoleErrors);

    await openBuilder(page);

    const palette = page.locator('[data-testid="palette"]');
    await expect(palette).toHaveAttribute("data-state", "collapsed");

    const before = await page.locator(".react-flow__node").count();
    const paletteItem = page.locator('[data-testid="palette-item"][data-node-type="play"]');
    await paletteItem.dragTo(page.locator(".react-flow__pane"));

    await expect(page.locator(".react-flow__node")).toHaveCount(before + 1);

    expect(pageErrors, "0 sự kiện pageerror").toEqual([]);
    expect(consoleErrors, "0 console error").toEqual([]);
  });
});
