import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Cùng fixture với `builder-canvas.spec.ts`: kịch bản `FLOW_MAIN`, phiên
 * bản mới nhất `PUBLISHED_DOCUMENT` (bảy node). Danh sách thuộc tính hợp
 * lệ của TC-CALL-021 đọc trực tiếp từ `contracts/flow-document.schema.json`
 * bằng `fs`, không gõ tay — theo `3-plan-03-…md` mục Proof.
 */
const FLOW_URL = "/#/flows/5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d401";
const EXPECTED_NODE_COUNT = 7;

// Mười trường phải vắng mặt (Change Request 1 mục 1.2 của 1-intent.md).
const FORBIDDEN_FIELDS = [
  "rec",
  "timeout",
  "interrupt",
  "loop",
  "digits",
  "maxwait",
  "pos",
  "moh",
  "reason",
  "pre",
];

type SchemaDoc = {
  $defs: Record<string, { properties?: Record<string, unknown> }>;
};

function loadSchema(): SchemaDoc {
  const frontendRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  // Contract dùng chung nằm ở gốc monorepo: <repo>/contracts/, hai cấp trên frontend.
  const repoRoot = path.resolve(frontendRoot, "..", "..");
  const raw = readFileSync(
    path.join(repoRoot, "contracts", "flow-document.schema.json"),
    "utf-8",
  );
  return JSON.parse(raw) as SchemaDoc;
}

async function openBuilder(page: Page) {
  await page.goto(FLOW_URL);
  await expect(page.locator(".react-flow__node")).toHaveCount(
    EXPECTED_NODE_COUNT,
  );
}

/** Điều khiển mang chính `data-field="field"`, ví dụ select timezone. */
function fieldControl(inspector: Locator, field: string): Locator {
  return inspector.locator(`[data-field="${field}"]`).first();
}

/**
 * Bỏ chọn node hiện tại trước khi chọn node kế tiếp — cột inspector mở làm
 * canvas hẹp lại và viewport không refit, node ở mép phải có thể bị cắt và
 * cú bấm chọn node kế tiếp trúng vào cột inspector (Quy ước lô 9).
 */
async function deselectNode(page: Page): Promise<void> {
  await page.locator(".react-flow__pane").click({ position: { x: 5, y: 5 } });
}

test.describe("builder-inspector", () => {
  test.beforeEach(async ({ page }) => {
    await openBuilder(page);
  });

  test("TC-CALL-020 — inspector của Điều kiện theo lịch: timezone, danh sách khung thêm/xoá, năm trục, chọn rỗng", async ({
    page,
  }) => {
    await page.locator('[data-id="schedule"]').click();
    const inspector = page.locator('[data-testid="inspector"]');
    await expect(inspector).toBeVisible();

    const timezoneControl = fieldControl(inspector, "timezone");
    await expect(timezoneControl).toHaveCount(1);
    expect(await timezoneControl.evaluate((el) => el.tagName)).toBe("SELECT");

    const rules = inspector.locator('[data-testid="schedule-rule"]');
    await expect(rules).toHaveCount(2);

    await inspector.locator('[data-testid="rule-add"]').click();
    await expect(rules).toHaveCount(3);

    await rules.first().locator('[data-testid="rule-remove"]').click();
    await expect(rules).toHaveCount(2);

    const axisOrder = ["time", "weekday", "monthDay", "month", "year"];
    const ruleCount = await rules.count();
    for (let i = 0; i < ruleCount; i += 1) {
      const rule = rules.nth(i);
      const axes = rule.locator("[data-axis]");
      await expect(axes).toHaveCount(5);
      const actualOrder = await axes.evaluateAll((els) =>
        els.map((el) => el.getAttribute("data-axis")),
      );
      expect(actualOrder).toEqual(axisOrder);

      for (const axis of axisOrder) {
        const row = rule.locator(`[data-axis="${axis}"]`);
        await expect(row.locator('[data-bound="from"]')).toHaveCount(1);
        await expect(row.locator('[data-bound="to"]')).toHaveCount(1);
      }
    }

    const firstRule = rules.first();
    for (const axis of ["weekday", "monthDay", "month", "year"]) {
      const row = firstRule.locator(`[data-axis="${axis}"]`);
      for (const bound of ["from", "to"]) {
        const control = row.locator(`[data-bound="${bound}"]`);
        await expect(control.locator('option[value=""]')).toHaveCount(1);
      }
    }

    // Chọn rỗng ghim vào hàng weekday của khung thứ nhất (dữ liệu giả lập
    // rule 1: weekday from 1 to 5) — trước khi chọn rỗng, mốc from có giá
    // trị "1"; sau khi chọn rỗng ở from, cả hai mốc của hàng đó là "".
    const weekdayRow = firstRule.locator('[data-axis="weekday"]');
    const weekdayFrom = weekdayRow.locator('[data-bound="from"]');
    const weekdayTo = weekdayRow.locator('[data-bound="to"]');
    await expect(weekdayFrom).toHaveValue("1");
    await weekdayFrom.selectOption("");
    await expect(weekdayFrom).toHaveValue("");
    await expect(weekdayTo).toHaveValue("");

    const rulesRegion = inspector.locator('[data-field="rules"]');
    await expect(rulesRegion.locator("textarea")).toHaveCount(0);
    await expect(rulesRegion.locator('input[type="text"]')).toHaveCount(0);

    const inspectorText = (
      (await inspector.textContent()) ?? ""
    ).toLowerCase();
    expect(inspectorText).not.toContain("nghỉ lễ");
    expect(inspectorText).not.toContain("holiday");
  });

  test("TC-CALL-021 — mọi điều khiển nhập liệu của inspector ánh xạ về một thuộc tính có thật trong $defs", async ({
    page,
  }) => {
    const schema = loadSchema();
    const inspector = page.locator('[data-testid="inspector"]');

    const cases: Array<{ nodeId: string; defName: string }> = [
      { nodeId: "start", defName: "startNode" },
      { nodeId: "play-info", defName: "playNode" },
      { nodeId: "menu", defName: "menuNode" },
      { nodeId: "queue", defName: "queueNode" },
      { nodeId: "hangup", defName: "hangupNode" },
      { nodeId: "schedule", defName: "scheduleNode" },
    ];

    for (const { nodeId, defName } of cases) {
      // Bỏ chọn trước khi chọn node kế tiếp: cột inspector mở làm canvas hẹp
      // lại, viewport không refit — node mép phải có thể bị cắt.
      await deselectNode(page);
      await page.locator(`[data-id="${nodeId}"]`).click();
      await expect(inspector).toBeVisible();

      const allowedFields = Object.keys(
        schema.$defs[defName]?.properties ?? {},
      ).filter((name) => name !== "type");
      expect(
        allowedFields.length,
        `$defs.${defName}.properties phải có ít nhất một thuộc tính ngoài type`,
      ).toBeGreaterThan(0);

      const controls = inspector.locator(
        "input, select, textarea, [contenteditable]",
      );
      const controlCount = await controls.count();
      expect(
        controlCount,
        `node ${nodeId} phải có ít nhất một điều khiển nhập liệu trong inspector`,
      ).toBeGreaterThan(0);

      for (let i = 0; i < controlCount; i += 1) {
        const control = controls.nth(i);
        const dataField = await control.evaluate(
          (el) => el.closest("[data-field]")?.getAttribute("data-field") ?? null,
        );
        expect(
          dataField,
          `điều khiển thứ ${i} của node ${nodeId} phải nằm trong [data-field]`,
        ).not.toBeNull();
        expect(
          allowedFields,
          `data-field="${dataField}" của node ${nodeId} phải thuộc $defs.${defName}.properties`,
        ).toContain(dataField);
        expect(
          FORBIDDEN_FIELDS,
          `data-field="${dataField}" của node ${nodeId} không được là một trong mười trường đã bỏ`,
        ).not.toContain(dataField);
      }
    }
  });

  // Ca hồi quy "timeoutSeconds/maxRetries không bị parseInt cắt cụt số thập
  // phân/số mũ" (dùng .fill("2.9") trên input text) đã bỏ ở lô 11: từ
  // TC-FLOW-036 (Change Request 5), timeoutSeconds/maxRetries là
  // input[type=range] bước 1 — .fill("2.9") ném "Malformed value" trên
  // range. AC-42/inspector-visual.spec.ts kiểm hành vi đổi giá trị theo
  // số nguyên bằng phím mũi tên, thay cho ca này (lot-brief lô 11, mục
  // "Test phải viết").
});
