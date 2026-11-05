import { describe, expect, it } from "vitest";
import { listPhoneNumbers, listFlows, listVersions, getVersion } from "./api";

/**
 * Hợp đồng ranh giới dữ liệu (vai test và vai code cùng bám,
 * `3-plan-02…md` mục "Files that change" — `src/data/api.ts`):
 *   listPhoneNumbers() → Promise<Did[]>                 Did = { id, number, publishedVersionId }
 *   listFlows() → Promise<FlowSummary[]>                 { id, name, publishedVersionId, updatedAt }
 *   listVersions(flowId) → Promise<FlowVersionSummary[]> { id, flowId, versionNumber, status, didId, createdAt, createdBy }
 *   getVersion(flowId, versionId) → Promise<{ version, document }>
 * Mọi hàm trả bản sao (structuredClone) — sửa kết quả không được rò vào kho.
 */

describe("TC-PBX-009 — đầu số và kịch bản là hai bản ghi riêng, nối bằng tham chiếu", () => {
  it("TC-PBX-009: mọi hàm ranh giới trả Promise; id không trùng giữa hai tập; đầu số không mang tài liệu/tên kịch bản; publishedVersionId trỏ đúng phiên bản có thật", async () => {
    const numbersPromise = listPhoneNumbers();
    const flowsPromise = listFlows();
    expect(numbersPromise).toBeInstanceOf(Promise);
    expect(flowsPromise).toBeInstanceOf(Promise);

    const numbers = await numbersPromise;
    const flows = await flowsPromise;

    expect(numbers.length).toBeGreaterThanOrEqual(1);
    expect(flows.length).toBeGreaterThanOrEqual(1);

    const numberIds = numbers.map((n) => n.id);
    const flowIds = flows.map((f) => f.id);
    expect(new Set(numberIds).size).toBe(numberIds.length);
    expect(new Set(flowIds).size).toBe(flowIds.length);
    const overlap = numberIds.filter((id) => flowIds.includes(id));
    expect(overlap).toEqual([]);

    for (const number of numbers) {
      const record = number as unknown as Record<string, unknown>;
      expect(record).not.toHaveProperty("document");
      expect(record).not.toHaveProperty("nodes");
      expect(record).not.toHaveProperty("name");
      expect(record).not.toHaveProperty("flowName");
      for (const value of Object.values(record)) {
        expect(flows.some((f) => f.name === value)).toBe(false);
      }
    }

    const withPublished = numbers.filter((n) => n.publishedVersionId !== null);
    expect(withPublished.length).toBeGreaterThanOrEqual(1);
    const withoutPublished = numbers.filter((n) => n.publishedVersionId === null);
    expect(withoutPublished.length).toBeGreaterThanOrEqual(1);

    for (const number of withPublished) {
      let found = false;
      for (const flow of flows) {
        const versionsPromise = listVersions(flow.id);
        expect(versionsPromise).toBeInstanceOf(Promise);
        const versions = await versionsPromise;
        const match = versions.find((v) => v.id === number.publishedVersionId);
        if (match) {
          found = true;
          expect(match.flowId).toBe(flow.id);
          await expect(getVersion(flow.id, match.id)).resolves.toBeDefined();
          expect(flowIds).toContain(match.flowId);
        }
      }
      expect(found, `publishedVersionId ${number.publishedVersionId} phải khớp một phiên bản có thật`).toBe(true);
    }
  });
});

describe("ca không mang mã — khoá hợp đồng cho lô 3, 4, 5", () => {
  it("getVersion trả bản sao: sửa tài liệu nhận được không ảnh hưởng lần gọi sau", async () => {
    const flows = await listFlows();
    const flow = flows[0];
    const versions = await listVersions(flow.id);
    const version = versions[0];

    const first = await getVersion(flow.id, version.id);
    const doc = first.document as unknown as Record<string, unknown>;
    doc.schemaVersion = "bi-sua-hong";
    (doc.nodes as Record<string, unknown>).__intruder__ = { type: "hangup" };

    const second = await getVersion(flow.id, version.id);
    expect((second.document as unknown as Record<string, unknown>).schemaVersion).toBe("1.1.0");
    expect((second.document as unknown as Record<string, Record<string, unknown>>).nodes).not.toHaveProperty(
      "__intruder__",
    );
  });

  it("getVersion với versionId không thuộc flowId đó → reject", async () => {
    const flows = await listFlows();
    const flow = flows[0];

    await expect(getVersion(flow.id, "khong-thuoc-flow-nao-ca")).rejects.toBeDefined();
  });
});
