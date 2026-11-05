import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * Fixture của trang kiểm `#/spike` (chỉ render khi import.meta.env.DEV) —
 * đây là hợp đồng mà vai code phải hiện thực để test này chuyển xanh.
 * Không có tài liệu design nào chốt id/toạ độ cụ thể; vai test tự quyết
 * (ghi trong test-report.md) vì plan.md giao việc "định fixture" cho
 * chính test này (dòng "Test phải viết" lô 1).
 *
 * - 3 node, kiểu mặc định của @xyflow/react (mỗi node có 1 handle target
 *   trên và 1 handle source dưới):
 *     id "start", position { x: 0,   y: 0 }
 *     id "play",  position { x: 300, y: 0 }
 *     id "hangup",position { x: 600, y: 0 }
 * - 2 cạnh ban đầu:
 *     id "e-start-play": start -> play
 *     id "e-play-hangup": play -> hangup
 * - Không gọi fitView, không đặt defaultViewport khác { x:0, y:0, zoom:1 }
 *   — nếu không thì assert toạ độ tuyệt đối bên dưới sẽ đỏ vì lý do khác
 *   với cái test này đang kiểm.
 * - Handle nguồn còn trống để test nối cạnh mới: handle source của
 *   "hangup" (chưa nối đi đâu) kéo sang handle target của "start" (chưa
 *   có ai nối vào).
 * - Mỗi node lộ `data-measured-width` = `measured.width` do React Flow đo.
 * - Bề rộng node phụ thuộc viewport (CSS) để việc đo lại có ý nghĩa.
 */

const SPIKE_PATH = "/#/spike";

test("TC-FLOW-012 — React 19 nạp được canvas ba node, 0 lỗi console", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const consoleWarnings: string[] = [];
  const pageErrors: Error[] = [];

  // Gắn listener console/pageerror TRƯỚC goto để không bỏ sót log lúc mount.
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
    if (msg.type() === "warning") consoleWarnings.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(err));

  await page.goto(SPIKE_PATH);

  const nodes = page.locator(".react-flow__node");
  await expect(nodes).toHaveCount(3);

  const startNode = page.locator('[data-testid="rf__node-start"]');
  const playNode = page.locator('[data-testid="rf__node-play"]');
  const hangupNode = page.locator('[data-testid="rf__node-hangup"]');

  await expect(startNode).toHaveAttribute("style", /translate\(0px,\s*0px\)/);
  await expect(playNode).toHaveAttribute("style", /translate\(300px,\s*0px\)/);
  await expect(hangupNode).toHaveAttribute("style", /translate\(600px,\s*0px\)/);

  // Chờ React Flow đo xong (ResizeObserver) trước khi chốt log console —
  // cảnh báo liên quan tới đo kích thước thường phát sinh ở nhịp này.
  await expect(startNode).toHaveAttribute("data-measured-width", /.+/);
  await expect(playNode).toHaveAttribute("data-measured-width", /.+/);
  await expect(hangupNode).toHaveAttribute("data-measured-width", /.+/);

  expect(pageErrors, "0 sự kiện pageerror").toEqual([]);
  expect(consoleErrors, "0 console error").toEqual([]);

  const suspiciousWarnings = consoleWarnings.filter((text) =>
    /react|xyflow/i.test(text),
  );
  expect(
    suspiciousWarnings,
    "0 console warning nhắc tới react/xyflow",
  ).toEqual([]);
});

test("TC-FLOW-012 — package.json khoá đúng phiên bản React 19 / @xyflow/react 12.3.6, không patch mã thư viện", async () => {
  const frontendRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const pkg = JSON.parse(
    readFileSync(path.join(frontendRoot, "package.json"), "utf-8"),
  ) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  expect(pkg.dependencies?.["@xyflow/react"]).toBe("12.3.6");
  expect(pkg.dependencies?.react).toMatch(/^19\.\d+\.\d+$/);
  expect(pkg.dependencies?.["react-dom"]).toMatch(/^19\.\d+\.\d+$/);

  expect(existsSync(path.join(frontendRoot, "patches"))).toBe(false);
  expect(pkg.dependencies?.["patch-package"]).toBeUndefined();
  expect(pkg.devDependencies?.["patch-package"]).toBeUndefined();
});

test("TC-FLOW-013 — cơ chế gốc: kéo node, minimap, nối cạnh mới, đo lại kích thước khi đổi viewport", async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (err) => pageErrors.push(err));

  await page.goto(SPIKE_PATH);
  await expect(page.locator(".react-flow__node")).toHaveCount(3);

  const playNode = page.locator('[data-testid="rf__node-play"]');
  const edgeIntoPlayPath = page.locator(
    '[data-testid="rf__edge-e-start-play"] .react-flow__edge-path',
  );
  await expect(edgeIntoPlayPath).toHaveCount(1);
  const dBefore = await edgeIntoPlayPath.getAttribute("d");

  const minimapRectsBefore = await page
    .locator(".react-flow__minimap-node")
    .evaluateAll((els) =>
      els.map((el) => ({
        x: el.getAttribute("x"),
        y: el.getAttribute("y"),
      })),
    );
  expect(minimapRectsBefore).toHaveLength(3);

  // (a)+(b) kéo node play đi >=100px bằng page.mouse (không locator.dragTo)
  const playBoxBefore = await playNode.boundingBox();
  if (!playBoxBefore) throw new Error("Không tìm thấy node play trên canvas");

  const startX = playBoxBefore.x + playBoxBefore.width / 2;
  const startY = playBoxBefore.y + playBoxBefore.height / 2;
  const targetX = startX + 150;
  const targetY = startY + 150;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 20 });
  await page.mouse.up();

  await expect(async () => {
    const dAfter = await edgeIntoPlayPath.getAttribute("d");
    expect(dAfter).not.toBe(dBefore);
  }).toPass();

  const minimapRectsAfter = await page
    .locator(".react-flow__minimap-node")
    .evaluateAll((els) =>
      els.map((el) => ({
        x: el.getAttribute("x"),
        y: el.getAttribute("y"),
      })),
    );
  expect(minimapRectsAfter).toHaveLength(3);
  const changedRects = minimapRectsAfter.filter((rectAfter, i) => {
    const rectBefore = minimapRectsBefore[i];
    return rectAfter.x !== rectBefore.x || rectAfter.y !== rectBefore.y;
  });
  expect(
    changedRects,
    "đúng 1 hình chữ nhật minimap đổi toạ độ sau khi kéo 1 node",
  ).toHaveLength(1);

  // (c) kéo từ handle nguồn còn trống của hangup sang handle đích còn trống của start
  const edgesBeforeConnect = await page.locator(".react-flow__edge").count();
  expect(edgesBeforeConnect).toBe(2);

  const sourceHandle = page.locator(
    '[data-testid="rf__node-hangup"] .react-flow__handle.source',
  );
  const targetHandle = page.locator(
    '[data-testid="rf__node-start"] .react-flow__handle.target',
  );
  const sourceBox = await sourceHandle.boundingBox();
  const targetBox = await targetHandle.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error("Không tìm thấy handle nguồn/đích còn trống");
  }

  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    { steps: 20 },
  );
  await page.mouse.up();

  await expect(page.locator(".react-flow__edge")).toHaveCount(
    edgesBeforeConnect + 1,
  );

  // (d) đổi kích thước viewport thì measured.width do React Flow đo đổi giá trị
  const measuredWidthBefore = await playNode.getAttribute(
    "data-measured-width",
  );
  const currentViewport = page.viewportSize();
  if (!currentViewport) throw new Error("Không lấy được viewport hiện tại");
  await page.setViewportSize({
    width: Math.max(320, Math.floor(currentViewport.width / 2)),
    height: currentViewport.height,
  });

  await expect(async () => {
    const measuredWidthAfter = await playNode.getAttribute(
      "data-measured-width",
    );
    expect(measuredWidthAfter).not.toBe(measuredWidthBefore);
  }).toPass();

  expect(pageErrors, "0 sự kiện pageerror trong khi thao tác").toEqual([]);

  // Ảnh chụp cho phần xác nhận bằng mắt của TC-FLOW-013 (không thuộc AC).
  await page.screenshot({
    path: "test-results/canvas-native-tc-flow-013.png",
  });
});
