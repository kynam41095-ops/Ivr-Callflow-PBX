import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * AC-27 / TC-FLOW-028 — bộ token của bản dựng thử phải có mặt nguyên vẹn
 * trên `document.documentElement` ở ba màn hình. Nguồn dữ liệu kiểm là
 * `e2e/fixtures/prototype-root.css` (chép nguyên văn dòng 17-58 của
 * `IVR Builder v3.dc.html`, xem lot-brief lô 6). Test tự kiểm sha256 của
 * fixture trước — nếu ai gõ tay hay sửa fixture, sha lệch, test đỏ ngay
 * chứ không lặng lẽ so sai dữ liệu.
 */

const EXPECTED_BLOCK_SHA256 = "d229b1d647d8bf49db03d8e39ff7ed7dfb48405138abe3efefd2fcc1d4c9c2b5";
const EXPECTED_VAR_COUNT = 122;
const FLOW_MAIN_ID = "5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d401";

// Bảy loại bước bị loại khỏi phạm vi (Ràng buộc 3) — các biến của chúng
// được phép vắng mặt trên document.documentElement.
const EXCLUDED_NODE_VAR = /^--n-(black|branch|api|setvar|survey|ext|goto)-/;

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function readFixture(): { raw: string; vars: Map<string, string> } {
  const fixturePath = path.join(__dirname, "fixtures", "prototype-root.css");
  const raw = readFileSync(fixturePath, "utf8");

  const lines = raw.split(/\r\n|\n/);
  const rootLineIndex = lines.findIndex((line) => /^\s*:root\s*\{\s*$/.test(line));
  expect(rootLineIndex, "fixture phải có một dòng ':root {' riêng biệt").toBeGreaterThanOrEqual(0);

  const block = lines.slice(rootLineIndex).join("\n");
  const blockSha256 = createHash("sha256").update(block).digest("hex");
  expect(blockSha256, "sha256 khối :root của fixture phải khớp bản chép nguyên văn").toBe(EXPECTED_BLOCK_SHA256);

  const inner = block
    .replace(/^\s*:root\s*\{/, "")
    .replace(/\}\s*$/, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  const vars = new Map<string, string>();
  for (const decl of inner.split(";")) {
    const trimmed = decl.trim();
    if (!trimmed) continue;
    const colonIndex = trimmed.indexOf(":");
    expect(colonIndex, `khai báo biến hợp lệ phải có dấu ':' — nhận '${trimmed}'`).toBeGreaterThan(0);
    const name = trimmed.slice(0, colonIndex).trim();
    const value = trimmed.slice(colonIndex + 1).trim();
    vars.set(name, value);
  }

  return { raw, vars };
}

test.describe("tokens", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("TC-FLOW-028 — fixture nguyên văn đúng sha256 và đủ 122 biến", () => {
    const { vars } = readFixture();
    expect(vars.size).toBe(EXPECTED_VAR_COUNT);
    expect(vars.get("--acc")).toBe("#325cbd");
    expect(vars.get("--n-start-b")).toBe("oklch(0.6 0.125 152)");
  });

  const screens: Array<{ name: string; open: (page: import("@playwright/test").Page) => Promise<void> }> = [
    {
      name: "#/numbers",
      open: async (page) => {
        await page.goto("/#/numbers");
        await expect(page.locator('[data-testid="number-row"]').first()).toBeVisible();
      },
    },
    {
      name: `#/flows/${FLOW_MAIN_ID}`,
      open: async (page) => {
        await page.goto(`/#/flows/${FLOW_MAIN_ID}`);
        await expect(page.locator(".react-flow__node").first()).toBeVisible();
      },
    },
    {
      name: "versions-drawer",
      open: async (page) => {
        await page.goto(`/#/flows/${FLOW_MAIN_ID}`);
        await expect(page.locator(".react-flow__node").first()).toBeVisible();
        await page.locator('button[data-testid="versions-open"]').click();
        await expect(page.locator('aside[data-testid="versions-drawer"]')).toBeVisible();
      },
    },
  ];

  for (const screen of screens) {
    test(`TC-FLOW-028 — biến của fixture khớp document.documentElement trên ${screen.name}`, async ({ page }) => {
      const pageErrors: Error[] = [];
      page.on("pageerror", (err) => pageErrors.push(err));

      const { vars } = readFixture();
      await screen.open(page);

      const computed = await page.evaluate((names: string[]) => {
        const style = getComputedStyle(document.documentElement);
        const out: Record<string, string> = {};
        for (const name of names) out[name] = style.getPropertyValue(name);
        return out;
      }, Array.from(vars.keys()));

      const mismatches: string[] = [];
      for (const [name, expected] of vars) {
        const actual = collapseWhitespace(computed[name] ?? "");
        if (EXCLUDED_NODE_VAR.test(name)) continue; // được phép vắng mặt
        if (actual !== collapseWhitespace(expected)) {
          mismatches.push(`${name}: expected "${expected}" got "${computed[name] ?? ""}"`);
        }
      }
      expect(mismatches, mismatches.join("\n")).toEqual([]);

      expect(pageErrors, "0 sự kiện pageerror").toEqual([]);
    });
  }
});
