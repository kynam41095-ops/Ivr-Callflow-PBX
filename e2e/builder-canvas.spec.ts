import { expect, test, type Page } from "@playwright/test";

/**
 * Trình dựng mở kịch bản giả lập `FLOW_MAIN` (id gõ cứng, xem
 * `src/data/mock.ts`), phiên bản mới nhất (`versionNumber` 2,
 * `PUBLISHED_DOCUMENT`) có bảy node: start, schedule, menu, play-info,
 * play-closed, queue, hangup. Không import `mock.ts` vào spec — quy ước
 * DOM và id lấy từ `3-plan-03-…md` mục "Files that change" / "Proof".
 */
const FLOW_URL = "/#/flows/5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d401";
const EXPECTED_NODE_COUNT = 7;

const FORBIDDEN_PALETTE_TYPES = [
  "black",
  "branch",
  "api",
  "setvar",
  "survey",
  "ext",
  "goto",
];

async function openBuilder(page: Page) {
  await page.goto(FLOW_URL);
  await expect(page.locator(".react-flow__node")).toHaveCount(
    EXPECTED_NODE_COUNT,
  );
}

test.describe("builder-canvas", () => {
  test.beforeEach(async ({ page }) => {
    await openBuilder(page);
  });

  test.describe("TC-CALL-015 viewport 1440x900", () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("TC-CALL-015 — palette thu gọn: 0 palette-label, không aria-label nào chứa bảy tên đã bỏ; mở rộng: đúng sáu tên (sửa CR 5)", async ({
      page,
    }) => {
    const palette = page.locator('[data-testid="palette"]');
    const items = page.locator('[data-testid="palette-item"]');

    // Palette mặc định thu gọn (Quy ước lô 10): 0 palette-label nhìn thấy,
    // sáu mục vẫn có mặt qua data-node-type + aria-label.
    await expect(palette).toHaveAttribute("data-state", "collapsed");
    await expect(page.locator('[data-testid="palette-label"]')).toHaveCount(0);
    await expect(items).toHaveCount(6);

    const types = await items.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-node-type")).sort(),
    );
    expect(types).toEqual(
      ["hangup", "menu", "play", "queue", "schedule", "start"].sort(),
    );

    const ariaLabelsCollapsed = await items.evaluateAll((els) =>
      els.map((el) => (el.getAttribute("aria-label") ?? "").toLowerCase()),
    );
    for (const forbidden of FORBIDDEN_PALETTE_TYPES) {
      for (const label of ariaLabelsCollapsed) {
        expect(label, `aria-label mục palette không chứa "${forbidden}"`).not.toContain(
          forbidden.toLowerCase(),
        );
      }
    }

    // Bấm palette-toggle rồi mới đọc nhãn — kết luận của AC-11 giữ.
    await page.locator('[data-testid="palette-toggle"]').click();
    await expect(palette).toHaveAttribute("data-state", "expanded");

    // Lô 9: mỗi palette-item chứa palette-code rồi palette-label — nhãn AC-11
    // đọc từ palette-label, không phải toàn bộ text của palette-item (mã
    // ngắn palette-code không được tính vào nhãn).
    const labels = (
      await page.locator('[data-testid="palette-item"] [data-testid="palette-label"]').allTextContents()
    ).map((t) => t.trim());
    expect(labels.sort()).toEqual(
      [
        "Bắt đầu",
        "Phát lời thoại",
        "Menu phím bấm",
        "Chuyển hàng đợi",
        "Kết thúc",
        "Điều kiện theo lịch",
      ].sort(),
    );

    // Không mục palette nào (kể cả khoá/mờ) mang một trong bảy loại đã bỏ —
    // tìm trong cả trang, không chỉ trong vùng palette.
    const allNodeTypeAttrs = await page
      .locator("[data-node-type]")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-node-type")));
    for (const forbidden of FORBIDDEN_PALETTE_TYPES) {
      expect(allNodeTypeAttrs, `không có data-node-type="${forbidden}"`).not.toContain(
        forbidden,
      );
    }

    const paletteText = (
      (await page.locator('[data-testid="palette"]').textContent()) ?? ""
    ).toLowerCase();
    for (const forbidden of FORBIDDEN_PALETTE_TYPES) {
      expect(
        paletteText,
        `nhãn palette không chứa "${forbidden}"`,
      ).not.toContain(forbidden.toLowerCase());
    }
    });
  });

  test("TC-CALL-016 — node Chuyển hàng đợi không có điểm nối nguồn nào trên canvas", async ({
    page,
  }) => {
    const queueNode = page.locator('.react-flow__node-queue[data-id="queue"]');
    await expect(queueNode).toBeVisible();
    await expect(queueNode.locator(".react-flow__handle.source")).toHaveCount(
      0,
    );
  });

  test("TC-CALL-017 — kéo thả bước Bắt đầu từ palette: node mới có 2 điểm nối nguồn với hai nhãn khác nhau", async ({
    page,
  }) => {
    const startNodesBefore = page.locator(".react-flow__node-start");
    await expect(startNodesBefore).toHaveCount(1);

    const paletteStart = page.locator(
      '[data-testid="palette-item"][data-node-type="start"]',
    );
    await paletteStart.dragTo(page.locator(".react-flow__pane"));

    const startNodesAfter = page.locator(".react-flow__node-start");
    await expect(startNodesAfter).toHaveCount(2);

    const ids = await startNodesAfter.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-id")),
    );
    const newId = ids.find((id) => id !== "start");
    expect(newId, "node mới phải có id khác node start có sẵn").toBeTruthy();

    const newNode = page.locator(
      `.react-flow__node-start[data-id="${newId}"]`,
    );
    const sourceHandles = newNode.locator(".react-flow__handle.source");
    await expect(sourceHandles).toHaveCount(2);

    const handleIds = await sourceHandles.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-handleid")).sort(),
    );
    expect(handleIds).toEqual(["fallback", "next"]);

    const handleLabels = newNode.locator('[data-testid="handle-label"]');
    await expect(handleLabels).toHaveCount(2);
    await expect(handleLabels.nth(0)).toBeVisible();
    await expect(handleLabels.nth(1)).toBeVisible();
    const texts = (await handleLabels.allTextContents()).map((t) => t.trim());
    expect(texts[0]).not.toBe("");
    expect(texts[1]).not.toBe("");
    expect(texts[0]).not.toBe(texts[1]);
  });

  test("TC-CALL-018 — node Menu phím bấm hai phím có đúng 4 điểm nối nguồn", async ({
    page,
  }) => {
    const menuNode = page.locator('[data-id="menu"]');
    const sourceHandles = menuNode.locator(".react-flow__handle.source");
    await expect(sourceHandles).toHaveCount(4);

    const handleIds = await sourceHandles.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-handleid")).sort(),
    );
    expect(handleIds).toEqual(
      ["choice-1", "choice-2", "invalid", "timeout"].sort(),
    );

    await expect(
      menuNode.locator('[data-testid="handle-label"][data-handleid="choice-1"]'),
    ).toHaveText("Phím 1");
    await expect(
      menuNode.locator('[data-testid="handle-label"][data-handleid="choice-2"]'),
    ).toHaveText("Phím 2");

    const allLabels = menuNode.locator('[data-testid="handle-label"]');
    await expect(allLabels).toHaveCount(4);
    for (let i = 0; i < 4; i += 1) {
      await expect(allLabels.nth(i)).toBeVisible();
    }
    const texts = (await allLabels.allTextContents()).map((t) => t.trim());
    for (const text of texts) {
      expect(text).not.toBe("");
    }
  });

  test("TC-CALL-019 — node Điều kiện theo lịch có đúng 2 nhánh, không có chữ Nghỉ lễ", async ({
    page,
  }) => {
    const scheduleNode = page.locator('[data-id="schedule"]');
    const sourceHandles = scheduleNode.locator(".react-flow__handle.source");
    await expect(sourceHandles).toHaveCount(2);

    const handleIds = await sourceHandles.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-handleid")).sort(),
    );
    expect(handleIds).toEqual(["closed", "open"]);

    await expect(
      scheduleNode.locator('[data-testid="handle-label"][data-handleid="open"]'),
    ).toHaveText("Trong giờ");
    await expect(
      scheduleNode.locator(
        '[data-testid="handle-label"][data-handleid="closed"]',
      ),
    ).toHaveText("Ngoài giờ");

    const text = ((await scheduleNode.textContent()) ?? "").toLowerCase();
    expect(text).not.toContain("nghỉ lễ");
  });

  test("hồi quy — huỷ kéo từ palette rồi thả nội dung khác không tạo nhầm node", async ({
    page,
  }) => {
    // Ca không mang mã TC — bảo vệ BLOCKING review iter 6: `dragTypeRef`
    // chỉ được xoá trong `onDrop`, không được xoá khi huỷ kéo ngoài canvas;
    // lần thả tiếp theo (không phải từ palette) sẽ tạo nhầm node.
    const pane = page.locator(".react-flow__pane");
    const paletteStart = page.locator(
      '[data-testid="palette-item"][data-node-type="start"]',
    );

    // 1) Huỷ một lần kéo mục Bắt đầu từ palette: thả lại vào chính palette
    // (không phải canvas) — không preventDefault ở dragover nên không có
    // drop, chỉ có dragend.
    await paletteStart.dragTo(page.locator('[data-testid="palette"]'));
    await expect(page.locator(".react-flow__node")).toHaveCount(
      EXPECTED_NODE_COUNT,
    );

    // 2) Thả nội dung không phải từ palette (text/plain) vào canvas.
    const dataTransfer = await page.evaluateHandle(() => {
      const d = new DataTransfer();
      d.setData("text/plain", "abc");
      return d;
    });
    const box = await pane.boundingBox();
    if (!box) throw new Error("không lấy được boundingBox của pane");
    const clientX = box.x + box.width / 2;
    const clientY = box.y + box.height / 2;

    await pane.dispatchEvent("dragover", { dataTransfer, clientX, clientY });
    await pane.dispatchEvent("drop", { dataTransfer, clientX, clientY });

    await expect(page.locator(".react-flow__node")).toHaveCount(
      EXPECTED_NODE_COUNT,
    );
    await expect(page.locator(".react-flow__node-start")).toHaveCount(1);
  });

  test("mở trình dựng kịch bản đủ sáu loại — 0 pageerror, 0 console error, 0 warning react/xyflow", async ({
    page,
  }) => {
    // Ca không mang mã TC — chặn sớm regressions cho AC-25 (lô 5), xem
    // `3-plan-03-…md` mục Proof "Ca không mang mã".
    const consoleErrors: string[] = [];
    const consoleWarnings: string[] = [];
    const pageErrors: Error[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
      if (msg.type() === "warning") consoleWarnings.push(msg.text());
    });
    page.on("pageerror", (err) => pageErrors.push(err));

    await page.goto(FLOW_URL);
    await expect(page.locator(".react-flow__node")).toHaveCount(
      EXPECTED_NODE_COUNT,
    );

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
});

test("hồi quy — hash không mã hoá hợp lệ (#/flows/%) không làm sập ứng dụng", async ({
  page,
}) => {
  // Ca không mang mã TC — đặt ngoài describe("builder-canvas") vì cần một
  // lần nạp trang sạch, không dùng beforeEach(openBuilder). Bảo vệ review
  // BLOCKING iter 5: decodeURIComponent("%") từng ném URIError làm sập App.
  const pageErrors: Error[] = [];
  const consoleErrors: string[] = [];

  page.on("pageerror", (err) => pageErrors.push(err));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto("/#/flows/%");

  await expect(page.getByRole("alert")).toBeVisible();
  // Lô 9: `.app-header` (và `h1` "IVR Builder") bị bỏ — trang lỗi vẫn phải
  // giữ đường về danh sách đầu số qua nav-numbers.
  await expect(page.locator('[data-testid="nav-numbers"]')).toBeVisible();
  expect(pageErrors, "0 sự kiện pageerror").toEqual([]);
});
