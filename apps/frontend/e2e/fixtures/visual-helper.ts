/**
 * So bản dựng thử (Claude Design) với app — helper dùng chung của squad (user chốt 25/09/2026).
 *
 * Session chính chép file này vào `e2e/fixtures/visual-helper.ts` (bản dựng thử vào
 * `e2e/fixtures/prototype/`) ở S0b bước 12. Vai test import, không sửa; vai code không chạm
 * (gate S4 khoá `e2e/fixtures/`).
 *
 * - `servePrototype`: runtime `support.js` không chạy từ file://, nên phục vụ qua HTTP cổng ngẫu nhiên.
 *   Server chạy trong spec, không thêm `webServer` vào `playwright.config.ts` (Cổng 0).
 * - `openPrototype`: script/style tải hỏng hoặc tải quá lâu (CDN unpkg, jsdelivr) → ném
 *   `PROTOTYPE_RENDER_FAILED` để session chính xử B24, không tính là test đỏ của code.
 * - `inventory` + `diffInventory`: kiểm kê nhãn giao diện hai bên — cổng cứng của so ảnh.
 * - `composite`: ảnh ghép [bản dựng thử | app | vùng lệch đỏ] và % pixel lệch — chỉ để báo cáo.
 */
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { Browser, Page } from "@playwright/test";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

export async function servePrototype(dir: string): Promise<{ url: string; close: () => Promise<void> }> {
  const root = path.resolve(dir);
  const server = createServer((req, res) => {
    const file = path.join(root, decodeURIComponent((req.url ?? "/").split("?")[0]));
    if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export async function openPrototype(page: Page, url: string): Promise<void> {
  const failed: string[] = [];
  page.on("requestfailed", (r) => {
    if (["script", "stylesheet"].includes(r.resourceType())) failed.push(r.url());
  });
  try {
    await page.goto(url, { waitUntil: "networkidle" });
  } catch (e) {
    throw new Error(`PROTOTYPE_RENDER_FAILED timeout ${url} — ${(e as Error).message.split("\n")[0]}`, { cause: e });
  }
  if (failed.length > 0) throw new Error(`PROTOTYPE_RENDER_FAILED ${failed.join(" ")}`);
}

const CHROME =
  "button, [role=button], [role=tab], [role=menuitem], [draggable=true], a[href], th, h1, h2, h3, h4, label, input[placeholder], [title], [aria-label]";

/**
 * Nhãn giao diện đang hiện: chữ (gộp dòng, tối đa 80 ký tự), placeholder, title, aria-label. Số → `#`, bỏ `{{ … }}` chưa render.
 * Phần tử chứa phần tử khớp khác (vd khung drawer có `aria-label`) chỉ lấy thuộc tính, không lấy chữ — chữ đó của con.
 * `ignoreInside`: vùng chứa dữ liệu, không phải nhãn giao diện (vd `.react-flow__viewport` — node, cạnh).
 */
export async function inventory(page: Page, ignoreInside: string[] = []): Promise<string[]> {
  const raw = await page.$$eval(
    CHROME,
    (els, [ignore, chrome]) =>
      els.flatMap((el) => {
        if (!el.checkVisibility() || ignore.some((sel) => el.closest(sel))) return [];
        const out = el.querySelector(chrome) ? [] : [(el as HTMLElement).innerText ?? ""];
        for (const attr of ["placeholder", "title", "aria-label"]) out.push(el.getAttribute(attr) ?? "");
        return out;
      }),
    [ignoreInside, CHROME] as const,
  );
  const tokens = raw
    .map((t) => t.replace(/\s+/g, " ").trim().replace(/\d+([.,]\d+)*/g, "#").slice(0, 80))
    .filter((t) => t !== "" && !/\{\{.*\}\}/.test(t));
  return [...new Set(tokens)].sort();
}

/** `missing`: có ở bản dựng thử, app không có, không nằm trong danh sách miễn. `extra`: app có thêm. */
export function diffInventory(proto: string[], app: string[], exempt: (string | RegExp)[] = []) {
  const isExempt = (t: string) => exempt.some((e) => (typeof e === "string" ? e === t : e.test(t)));
  const inApp = new Set(app);
  const inProto = new Set(proto);
  return {
    missing: proto.filter((t) => !inApp.has(t) && !isExempt(t)),
    extra: app.filter((t) => !inProto.has(t)),
  };
}

/** Ghép [bản dựng thử | app | vùng lệch đỏ] ở nửa cỡ, trả % pixel lệch (ngưỡng 24/255 theo độ sáng). */
export async function composite(browser: Browser, protoPng: string, appPng: string, outPng: string): Promise<number> {
  const dataUrl = (f: string) => `data:image/png;base64,${readFileSync(f).toString("base64")}`;
  const page = await browser.newPage();
  try {
    await page.setContent("<body style='margin:0'><canvas id='c'></canvas></body>");
    const pct = await page.evaluate(async ([a, b]) => {
      const load = (src: string) =>
        new Promise<HTMLImageElement>((ok, fail) => {
          const img = new Image();
          img.onload = () => ok(img);
          img.onerror = fail;
          img.src = src;
        });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      if (ia.width !== ib.width || ia.height !== ib.height) throw new Error("hai ảnh khác cỡ");
      const w = ia.width;
      const h = ia.height;
      const pixels = (img: HTMLImageElement) => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d") as CanvasRenderingContext2D;
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, w, h).data;
      };
      const pa = pixels(ia);
      const pb = pixels(ib);
      const diff = new ImageData(w, h);
      let bad = 0;
      for (let i = 0; i < pa.length; i += 4) {
        const d = 0.299 * Math.abs(pa[i] - pb[i]) + 0.587 * Math.abs(pa[i + 1] - pb[i + 1]) + 0.114 * Math.abs(pa[i + 2] - pb[i + 2]);
        if (d > 24) {
          bad++;
          diff.data.set([220, 30, 30, 255], i);
        } else {
          diff.data.set([pb[i] * 0.4 + 153, pb[i + 1] * 0.4 + 153, pb[i + 2] * 0.4 + 153, 255], i);
        }
      }
      const dc = document.createElement("canvas");
      dc.width = w;
      dc.height = h;
      (dc.getContext("2d") as CanvasRenderingContext2D).putImageData(diff, 0, 0);
      const out = document.getElementById("c") as HTMLCanvasElement;
      out.width = (w * 3) / 2;
      out.height = h / 2;
      const ctx = out.getContext("2d") as CanvasRenderingContext2D;
      [ia, ib, dc].forEach((src, k) => ctx.drawImage(src, (k * w) / 2, 0, w / 2, h / 2));
      return (100 * bad) / (w * h);
    }, [dataUrl(protoPng), dataUrl(appPng)]);
    await page.setViewportSize({ width: 2400, height: 600 });
    await page.locator("#c").screenshot({ path: outPng });
    return pct;
  } finally {
    await page.close();
  }
}
