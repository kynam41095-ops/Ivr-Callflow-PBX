import { describe, expect, it } from "vitest";
import { saveDraft, createFlow, listFlows, listVersions, getVersion, listPhoneNumbers } from "./api";
import { newFlowDocument } from "../canvas/steps";

/**
 * Hợp đồng hàm mới của lô 4 (vai test và vai code cùng bám, `3-plan-04…md`
 * mục "Files that change"):
 *   saveDraft(flowId, document, restoredFromVersionId?) → Promise<FlowVersionSummary>
 *     status: "draft"; versionNumber = lớn nhất trước đó + 1; reject khi
 *     flowId không tồn tại, restoredFromVersionId không thuộc kịch bản, hoặc
 *     tài liệu không qua lớp 1 (checkShape). Lớp 2 đỏ vẫn lưu được.
 *   createFlow(name) → Promise<FlowSummary>  publishedVersionId: null,
 *     không tạo phiên bản. Reject khi tên rỗng/toàn khoảng trắng/> 200 ký tự.
 * Không gõ cứng số phiên bản — mọi giá trị mong đợi tính từ listVersions
 * ngay trước khi gọi (nhiều `it` trong file này dùng chung một kho module).
 */

async function latestVersionOf(flowId: string) {
  const versions = await listVersions(flowId);
  return versions.reduce((a, b) => (a.versionNumber > b.versionNumber ? a : b));
}

describe("TC-FLOW-020 (phần unit) — saveDraft trả Promise, resolve bản draft mới", () => {
  it("TC-FLOW-020: saveDraft trả Promise, resolve status draft, versionNumber tăng đúng 1, didId null, id mới lạ; listVersions/getVersion phản ánh đúng", async () => {
    const flows = await listFlows();
    const flow = flows[0];
    const versionsBefore = await listVersions(flow.id);
    const idsBefore = new Set(versionsBefore.map((v) => v.id));
    const latest = await latestVersionOf(flow.id);
    const { document } = await getVersion(flow.id, latest.id);

    const p = saveDraft(flow.id, document);
    expect(p).toBeInstanceOf(Promise);
    const saved = await p;

    expect(saved.status).toBe("draft");
    expect(saved.flowId).toBe(flow.id);
    expect(saved.didId).toBeNull();
    expect(saved.versionNumber).toBe(latest.versionNumber + 1);
    expect(idsBefore.has(saved.id)).toBe(false);

    const versionsAfter = await listVersions(flow.id);
    expect(versionsAfter.some((v) => v.id === saved.id)).toBe(true);

    const { document: savedDoc } = await getVersion(flow.id, saved.id);
    expect(savedDoc).toStrictEqual(document);
  });

  it("bản chụp: sửa tài liệu gốc sau khi gọi saveDraft (trước khi resolve) không ảnh hưởng bản đã lưu", async () => {
    const flows = await listFlows();
    const flow = flows[0];
    const latest = await latestVersionOf(flow.id);
    const { document } = await getVersion(flow.id, latest.id);

    const p = saveDraft(flow.id, document);
    document.nodes[document.startNodeId].label = "bi-sua-sau-khi-goi";
    const saved = await p;

    const { document: savedDoc } = await getVersion(flow.id, saved.id);
    expect(savedDoc.nodes[savedDoc.startNodeId].label).not.toBe("bi-sua-sau-khi-goi");
  });

  it("song song: hai saveDraft cùng lúc cho hai versionNumber liên tiếp, không trùng, hai id khác nhau", async () => {
    const flows = await listFlows();
    const flow = flows[0];
    const latest = await latestVersionOf(flow.id);
    const { document } = await getVersion(flow.id, latest.id);

    const [a, b] = await Promise.all([saveDraft(flow.id, document), saveDraft(flow.id, document)]);

    const numbers = [a.versionNumber, b.versionNumber].sort((x, y) => x - y);
    expect(numbers).toEqual([latest.versionNumber + 1, latest.versionNumber + 2]);
    expect(a.id).not.toBe(b.id);
  });

  it("không đụng phiên bản khác: bản published giữ nguyên id/status, publishedVersionId của kịch bản và đầu số không đổi", async () => {
    const flowsBefore = await listFlows();
    const flow = flowsBefore.find((f) => f.publishedVersionId !== null);
    expect(flow, "cần một kịch bản có phiên bản published").toBeDefined();
    const publishedIdBefore = flow!.publishedVersionId;

    const versionsBefore = await listVersions(flow!.id);
    const published = versionsBefore.find((v) => v.status === "published");
    expect(published, "cần một phiên bản published").toBeDefined();

    const latest = await latestVersionOf(flow!.id);
    const { document } = await getVersion(flow!.id, latest.id);

    await saveDraft(flow!.id, document);

    const versionsAfter = await listVersions(flow!.id);
    const publishedAfter = versionsAfter.find((v) => v.id === published!.id);
    expect(publishedAfter?.status).toBe("published");
    expect(publishedAfter?.id).toBe(published!.id);

    const flowsAfter = await listFlows();
    const flowAfter = flowsAfter.find((f) => f.id === flow!.id);
    expect(flowAfter?.publishedVersionId).toBe(publishedIdBefore);

    const numbers = await listPhoneNumbers();
    const matchingNumber = numbers.find((n) => n.publishedVersionId === publishedIdBefore);
    expect(matchingNumber, "đầu số vẫn trỏ đúng phiên bản published").toBeDefined();
  });

  it("khôi phục: restoredFromVersionId của bản archived cùng kịch bản → resolve bản draft mới", async () => {
    const flows = await listFlows();
    const flow = flows[0];
    const versions = await listVersions(flow.id);
    const archived = versions.find((v) => v.status === "archived");
    expect(archived, "cần một phiên bản archived").toBeDefined();
    const { document } = await getVersion(flow.id, archived!.id);

    const saved = await saveDraft(flow.id, document, archived!.id);
    expect(saved.status).toBe("draft");
  });

  it("lớp 2 đỏ vẫn lưu được: kịch bản mới có nhánh treo vẫn resolve (khoá hợp đồng cho TC-FLOW-024)", async () => {
    const flow = await createFlow("Kịch bản mới cho unit lô 4 — nhánh treo");
    const saved = await saveDraft(flow.id, newFlowDocument());
    expect(saved.status).toBe("draft");
  });
});

describe("saveDraft — dữ liệu nhập bất thường: reject, kho không đổi độ dài", () => {
  it("flowId không tồn tại → reject", async () => {
    const fakeFlowId = crypto.randomUUID();
    const doc = newFlowDocument();
    await expect(saveDraft(fakeFlowId, doc)).rejects.toBeDefined();
  });

  it("restoredFromVersionId không thuộc kịch bản → reject, listVersions giữ nguyên độ dài", async () => {
    const flows = await listFlows();
    const flow = flows[0];
    const versionsBefore = await listVersions(flow.id);
    const latest = await latestVersionOf(flow.id);
    const { document } = await getVersion(flow.id, latest.id);

    await expect(saveDraft(flow.id, document, crypto.randomUUID())).rejects.toBeDefined();

    const versionsAfter = await listVersions(flow.id);
    expect(versionsAfter.length).toBe(versionsBefore.length);
  });

  it("tài liệu lớp 1 đỏ (xoá mediaId của node play-info) → reject, listVersions giữ nguyên độ dài", async () => {
    const flows = await listFlows();
    const flow = flows.find((f) => f.publishedVersionId !== null);
    expect(flow).toBeDefined();
    const versionsBefore = await listVersions(flow!.id);
    const published = versionsBefore.find((v) => v.status === "published");
    expect(published).toBeDefined();
    const { document } = await getVersion(flow!.id, published!.id);
    const broken = document as unknown as { nodes: Record<string, Record<string, unknown>> };
    expect(broken.nodes["play-info"], "kịch bản published cần node play-info").toBeDefined();
    delete broken.nodes["play-info"].mediaId;

    await expect(saveDraft(flow!.id, document)).rejects.toBeDefined();

    const versionsAfter = await listVersions(flow!.id);
    expect(versionsAfter.length).toBe(versionsBefore.length);
  });
});

describe("ca dời từ lô 4 (review iter 8 MINOR) — restoredFromVersionId thuộc kịch bản khác", () => {
  it(
    "restoredFromVersionId là phiên bản có thật nhưng của một kịch bản KHÁC → reject cả hai chiều, " +
      "listVersions của cả hai kịch bản giữ nguyên độ dài (khoá hồi quy cho lô 5)",
    async () => {
      const flowsBefore = await listFlows();
      const flowA = flowsBefore.find((f) => f.publishedVersionId !== null);
      expect(flowA, "cần một kịch bản A có publishedVersionId khác null").toBeDefined();

      const versionsA = await listVersions(flowA!.id);
      const archivedA = versionsA.find((v) => v.status === "archived");
      expect(archivedA, "cần một phiên bản archived của A").toBeDefined();
      const latestA = versionsA.reduce((a, b) => (a.versionNumber > b.versionNumber ? a : b));
      const { document: docA } = await getVersion(flowA!.id, latestA.id);

      const flowB = await createFlow("Kịch bản B — ca chéo lô 5");
      const vB = await saveDraft(flowB.id, docA);

      const versionsALenBefore = (await listVersions(flowA!.id)).length;
      const versionsBLenBefore = (await listVersions(flowB.id)).length;

      // (a) lưu cho A với id phiên bản thuộc B.
      await expect(saveDraft(flowA!.id, docA, vB.id)).rejects.toBeDefined();
      // (b) chiều ngược: lưu cho B với id phiên bản archived thuộc A.
      await expect(saveDraft(flowB.id, docA, archivedA!.id)).rejects.toBeDefined();

      expect((await listVersions(flowA!.id)).length).toBe(versionsALenBefore);
      expect((await listVersions(flowB.id)).length).toBe(versionsBLenBefore);
    },
  );
});

describe("createFlow — tạo kịch bản mới, không tạo phiên bản", () => {
  it("createFlow trả Promise, resolve FlowSummary hợp lệ, xuất hiện trong listFlows với 0 phiên bản", async () => {
    const p = createFlow("Kịch bản mới cho unit lô 4 — trường hợp chính");
    expect(p).toBeInstanceOf(Promise);
    const flow = await p;

    expect(flow.name).toBe("Kịch bản mới cho unit lô 4 — trường hợp chính");
    expect(flow.publishedVersionId).toBeNull();
    expect(typeof flow.updatedAt).toBe("string");
    expect(typeof flow.id).toBe("string");
    expect(flow.id.length).toBeGreaterThan(0);

    const flows = await listFlows();
    expect(flows.some((f) => f.id === flow.id)).toBe(true);

    const versions = await listVersions(flow.id);
    expect(versions).toEqual([]);
  });

  it("createFlow với tên đúng 200 ký tự resolve", async () => {
    const name = "x".repeat(200);
    const flow = await createFlow(name);
    expect(flow.name).toBe(name);
  });

  it.each([
    ["", "rỗng"],
    ["   ", "toàn khoảng trắng"],
    ["x".repeat(201), "201 ký tự"],
  ])("createFlow(%j) — %s → reject, listFlows giữ nguyên độ dài", async (name) => {
    const flowsBefore = await listFlows();
    await expect(createFlow(name)).rejects.toBeDefined();
    const flowsAfter = await listFlows();
    expect(flowsAfter.length).toBe(flowsBefore.length);
  });
});
