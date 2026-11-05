import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFlow,
  createPhoneNumber,
  getVersion,
  listFlows,
  listPhoneNumbers,
  listQueues,
  listVersions,
  saveDraft,
} from "./api";

/**
 * Hợp đồng `failIfMocked` của lô 5 (vai test và vai code cùng bám,
 * `3-plan-05…md` mục "Files that change" — `src/data/api.ts`): chỉ hoạt
 * động ở `import.meta.env.DEV`, đọc `location.search` **tại mỗi lần gọi**
 * (không lúc nạp module), `?mockFail=<tên hàm>[,<tên khác>]` (tách theo dấu
 * phẩy, cũng nhận nhiều tham số cùng tên qua `getAll`) làm **đúng** hàm đó
 * reject với message chứa tên hàm; so khớp chính xác, phân biệt hoa thường.
 * Tên không khớp/rỗng thì vô hại. Không có `location` (Vitest môi trường
 * `node`, không stub) → hành vi cũ giữ nguyên (43 test cũ của lô 1-4 cũng là
 * bằng chứng cho ca này — không lặp lại ở đây).
 */

function stubSearch(search: string) {
  vi.stubGlobal("location", { search });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("mockFail — hỏng đúng hàm bị nêu tên", () => {
  it("?mockFail=listPhoneNumbers → listPhoneNumbers reject với message chứa tên hàm; listFlows vẫn resolve", async () => {
    stubSearch("?mockFail=listPhoneNumbers");
    await expect(listPhoneNumbers()).rejects.toThrow(/listPhoneNumbers/);
    await expect(listFlows()).resolves.toBeDefined();
  });

  it("?mockFail=saveDraft → saveDraft reject, listVersions giữ nguyên độ dài", async () => {
    const flows = await listFlows();
    const flow = flows[0];
    const versionsBefore = await listVersions(flow.id);
    const latest = versionsBefore.reduce((a, b) => (a.versionNumber > b.versionNumber ? a : b));
    const { document } = await getVersion(flow.id, latest.id);

    stubSearch("?mockFail=saveDraft");
    await expect(saveDraft(flow.id, document)).rejects.toBeDefined();
    vi.unstubAllGlobals();

    const versionsAfter = await listVersions(flow.id);
    expect(versionsAfter.length).toBe(versionsBefore.length);
  });

  it("?mockFail=createPhoneNumber → reject, listPhoneNumbers giữ nguyên độ dài", async () => {
    const before = await listPhoneNumbers();
    stubSearch("?mockFail=createPhoneNumber");
    await expect(createPhoneNumber("0909000000")).rejects.toBeDefined();
    vi.unstubAllGlobals();

    const after = await listPhoneNumbers();
    expect(after.length).toBe(before.length);
  });

  it("?mockFail=createFlow → reject, listFlows giữ nguyên độ dài", async () => {
    const before = await listFlows();
    stubSearch("?mockFail=createFlow");
    await expect(createFlow("Kịch bản hỏng do mockFail")).rejects.toBeDefined();
    vi.unstubAllGlobals();

    const after = await listFlows();
    expect(after.length).toBe(before.length);
  });

  it("?mockFail=listFlows,getVersion (tách theo dấu phẩy) → cả hai reject", async () => {
    const flows = await listFlows();
    const flow = flows[0];
    const versions = await listVersions(flow.id);
    const version = versions[0];

    stubSearch("?mockFail=listFlows,getVersion");
    await expect(listFlows()).rejects.toBeDefined();
    await expect(getVersion(flow.id, version.id)).rejects.toBeDefined();
  });

  it("?mockFail=listFlows&mockFail=listQueues (nhiều tham số cùng tên) → cả hai reject", async () => {
    stubSearch("?mockFail=listFlows&mockFail=listQueues");
    await expect(listFlows()).rejects.toBeDefined();
    await expect(listQueues()).rejects.toBeDefined();
  });
});

describe("mockFail — đầu vào vô hại: không hỏng gì", () => {
  it.each([["?mockFail=khongCo"], ["?mockFail="], ["?mockFail=__proto__"], ["?mockFail=LISTFLOWS"]])(
    "%s → listFlows() vẫn resolve",
    async (search) => {
      stubSearch(search);
      await expect(listFlows()).resolves.toBeDefined();
    },
  );
});

describe("mockFail — không lọt production", () => {
  it("vi.stubEnv(\"DEV\", false) + ?mockFail=listFlows → listFlows() vẫn resolve", async () => {
    stubSearch("?mockFail=listFlows");
    vi.stubEnv("DEV", false);
    await expect(listFlows()).resolves.toBeDefined();
  });
});
