import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { composite, diffInventory, inventory, openPrototype, servePrototype } from "./fixtures/visual-helper";

// `e2e/visual-compare.spec.ts` — chép theo mẫu
// `.claude/skills/squad/visual/visual-compare.example.ts` (đã chạy thật
// 25/09/2026). Chỉ thay STATES, DATA, EXEMPT theo khối `So ảnh` của lô 10
// trong `lot-brief.md`; thư mục ra và tên file `-diff.png` theo AC-45 và
// mục "Test phải viết" của lô 10 (khác mặc định `-compare.png` của mẫu).
// Không sửa `fixtures/visual-helper.ts`, không thêm `webServer` vào
// `playwright.config.ts`.
const OUT = path.resolve("test-results/visual-compare");
const PROTO_HTML = encodeURIComponent("IVR Builder v3.dc.html");
const FLOW = "5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d401";

// Vùng dữ liệu — helper không đọc khối tên/chip phiên bản (không thuộc CHROME).
const DATA = [".react-flow__viewport", ".react-flow__minimap"];

const EXEMPT: (string | RegExp)[] = [
  "?", // Miễn — bản dựng thử 25/09
  "Phím tắt (?)", // Miễn — bản dựng thử 25/09
  "Publish", // Miễn — bản dựng thử 25/09
  "Hoàn tác (Ctrl+Z)", // Miễn — bản dựng thử 25/09
  "Làm lại (Ctrl+Shift+Z)", // Miễn — bản dựng thử 25/09
  /^Đường nối /, // Miễn — bản dựng thử 25/09
  "Chế độ chọn vùng (V) — kéo để bôi chọn nhiều node", // CR 4.2
  "Tự sắp xếp luồng", // CR 3
  "Chuyển sang giao diện tối", // Ràng buộc 11
  "Tìm node…", // CR 5.2
  /^(GO|SV|IF|BL|EX|API|SET)( .+)?$/, // Miễn — bản dựng thử 25/09
  /^(HG Kết thúc cuộc gọi|PL Phát ghi âm|KB Bấm phím \(DTMF\)|TM Điều kiện giờ)$/, // Ràng buộc 3 (tên sáu bước, AC-11)
  "Vừa khung", // Tự quyết iter 1 (thanh nổi canvas)
  "Lưu bản nháp", // Tự quyết iter 1 (thanh nổi canvas)
];

type State = { name: string; proto: (p: Page) => Promise<void>; app: (p: Page) => Promise<void> };
const STATES: State[] = [
  {
    name: "builder",
    proto: async (p) => {
      await p.getByRole("button", { name: "Sửa", exact: true }).first().click();
    },
    app: async (p) => {
      await p.goto(`/#/flows/${FLOW}`);
    },
  },
  {
    name: "builder-palette",
    proto: async (p) => {
      await p.locator('button[title="Mở rộng thư viện node"]').click();
    },
    app: async (p) => {
      await p.getByTestId("palette-toggle").click();
    },
  },
];

test("TC-FLOW-034 — so ảnh bản dựng thử ↔ app — lô 10 (builder, builder-palette)", async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  const server = await servePrototype("e2e/fixtures/prototype");
  const proto = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const app = await browser.newPage({ viewport: { width: 1440, height: 900 }, baseURL: "http://localhost:5173" });
  const report: Record<string, unknown> = {};
  try {
    await openPrototype(proto, server.url + PROTO_HTML);
    for (const s of STATES) {
      await s.proto(proto);
      await s.app(app);
      await proto.waitForLoadState("networkidle");
      await app.waitForLoadState("networkidle");
      // "trước mỗi lần chụp, cả hai bên" — di chuột ra khỏi vùng đo để tránh
      // hover-state (tooltip, highlight) làm lệch ảnh chụp.
      await proto.mouse.move(700, 4);
      await app.mouse.move(700, 4);
      const pp = path.join(OUT, `${s.name}-proto.png`);
      const ap = path.join(OUT, `${s.name}-app.png`);
      await proto.screenshot({ path: pp, animations: "disabled" });
      await app.screenshot({ path: ap, animations: "disabled" });
      const diff = diffInventory(await inventory(proto, DATA), await inventory(app, DATA), EXEMPT);
      const pct = await composite(browser, pp, ap, path.join(OUT, `${s.name}-diff.png`));
      report[s.name] = { pixelPct: Number(pct.toFixed(1)), ...diff };
    }
  } finally {
    writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
    await server.close();
  }
  for (const [name, r] of Object.entries(report)) {
    expect.soft((r as { missing: string[] }).missing, `${name}: nhãn bản dựng thử app thiếu`).toEqual([]);
  }
});
