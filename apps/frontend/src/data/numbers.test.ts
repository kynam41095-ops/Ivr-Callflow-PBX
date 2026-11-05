import { describe, expect, it } from "vitest";
import { createPhoneNumber, listFlows, listPhoneNumbers } from "./api";

/**
 * Hợp đồng hàm mới của lô 5 (vai test và vai code cùng bám, `3-plan-05…md`
 * mục "Files that change" — `src/data/api.ts`):
 *   createPhoneNumber(number: string) → Promise<Did>
 *     Did = { id, number, publishedVersionId: null }, không có `name`/`flowName`/
 *     `document`/`nodes`. `number` được `trim` trước khi lưu. Reject khi
 *     `trim() === ""` hoặc dài hơn 32 ký tự, hoặc trùng một số đã có (so sau
 *     khi `trim`). Không ép định dạng khác (Tự quyết iter 9).
 */

describe("TC-PBX-010 (phần unit) — createPhoneNumber trả Promise, resolve Did hợp lệ", () => {
  it("createPhoneNumber(\"0901234567\"): id mới lạ, number đúng, publishedVersionId null, không mang name/flowName/document/nodes; xuất hiện trong listPhoneNumbers", async () => {
    const numbersBefore = await listPhoneNumbers();
    const flows = await listFlows();
    const usedIds = new Set([...numbersBefore.map((n) => n.id), ...flows.map((f) => f.id)]);

    const p = createPhoneNumber("0901234567");
    expect(p).toBeInstanceOf(Promise);
    const created = await p;

    expect(usedIds.has(created.id)).toBe(false);
    expect(created.number).toBe("0901234567");
    expect(created.publishedVersionId).toBeNull();
    const record = created as unknown as Record<string, unknown>;
    expect(record).not.toHaveProperty("name");
    expect(record).not.toHaveProperty("flowName");
    expect(record).not.toHaveProperty("document");
    expect(record).not.toHaveProperty("nodes");

    const numbersAfter = await listPhoneNumbers();
    expect(numbersAfter.some((n) => n.id === created.id && n.number === "0901234567")).toBe(true);
  });

  it("bản chụp: sửa object trả về không ảnh hưởng kho — listPhoneNumbers sau đó vẫn giữ number gốc", async () => {
    const created = await createPhoneNumber("0902345678");
    const mutated = created as unknown as Record<string, unknown>;
    mutated.number = "bi-sua-sau-khi-tra-ve";

    const numbers = await listPhoneNumbers();
    const stored = numbers.find((n) => n.id === created.id);
    expect(stored?.number).toBe("0902345678");
  });

  it("createPhoneNumber(\"  0907654321  \") → number đã trim", async () => {
    const created = await createPhoneNumber("  0907654321  ");
    expect(created.number).toBe("0907654321");
  });

  it("\"1\".repeat(32) (đúng biên trên) → resolve", async () => {
    const value = "1".repeat(32);
    const created = await createPhoneNumber(value);
    expect(created.number).toBe(value);
  });
});

describe("createPhoneNumber — dữ liệu nhập bất thường: reject, listPhoneNumbers giữ nguyên độ dài", () => {
  it.each([
    ["", "rỗng"],
    ["   ", "toàn khoảng trắng"],
    ["1".repeat(33), "33 ký tự (vượt biên)"],
    ["1900123456", "trùng dữ liệu gốc"],
    [" 1900123456 ", "trùng sau khi trim"],
  ])("createPhoneNumber(%j) — %s → reject, listPhoneNumbers giữ nguyên độ dài", async (value) => {
    const before = await listPhoneNumbers();
    await expect(createPhoneNumber(value)).rejects.toBeDefined();
    const after = await listPhoneNumbers();
    expect(after.length).toBe(before.length);
  });
});
