import { describe, expect, it } from "vitest";
import { collectIssues } from "./issues";
import { newFlowDocument } from "./steps";
import { checkShape, checkGraph } from "../flow/validate";
import { listFlows, listVersions, getVersion } from "../data/api";

/**
 * Hợp đồng hàm mới của lô 4 (vai test và vai code cùng bám, `3-plan-04…md`
 * mục "Files that change"):
 *   NodeIssue = { code: string; message: string; severity: "error"|"warning"; nodeId?: string }
 *   ValidationView = { valid: boolean; issues: NodeIssue[] }
 *   collectIssues(doc: unknown) → ValidationView — gọi luôn cả checkShape và
 *     checkGraph, gom mọi lỗi ajv của một node thành đúng một issue
 *     INVALID_SHAPE, không ném với đầu vào rác.
 *   newFlowDocument() → FlowDocument — một node start, hai nhánh giữ chỗ
 *     chưa nối (`chua-noi-nhanh-chinh`, `chua-noi-nhanh-du-phong`).
 */

const PATTERN_NODE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Kiểu tối thiểu để gõ các callback filter — không phải khai báo chính thức. */
type NodeIssue = { code: string; message: string; severity: "error" | "warning"; nodeId?: string };
type ValidationView = { valid: boolean; issues: NodeIssue[] };

/** Ép kiểu kết quả collectIssues theo hợp đồng đã chốt, không đổi giá trị runtime. */
function asView(result: unknown): ValidationView {
  return result as ValidationView;
}

async function publishedDocumentOfMainFlow() {
  const flows = await listFlows();
  const flow = flows.find((f) => f.publishedVersionId !== null);
  expect(flow, "cần một kịch bản có phiên bản published").toBeDefined();
  const versions = await listVersions(flow!.id);
  const published = versions.find((v) => v.status === "published");
  expect(published, "cần một phiên bản published").toBeDefined();
  const { document } = await getVersion(flow!.id, published!.id);
  return document;
}

describe("TC-FLOW-027 (phần unit) — node schedule mang cảnh báo, trên dữ liệu giả lập thật (không phải fixture tự dựng)", () => {
  it("TC-FLOW-027: kịch bản giả lập chứa node schedule có 0 lỗi lớp 1, 0 lỗi lớp 2, đúng 1 cảnh báo SCHEDULE_NOT_PUBLISHABLE gắn nodeId schedule; collectIssues → valid true, 0 issue lỗi, đúng 1 issue cảnh báo", async () => {
    const document = await publishedDocumentOfMainFlow();

    expect(checkShape(document).ok).toBe(true);
    const graph = checkGraph(document);
    expect(graph.errors).toHaveLength(0);
    expect(graph.warnings).toHaveLength(1);
    expect(graph.warnings[0]?.code).toBe("SCHEDULE_NOT_PUBLISHABLE");
    expect(graph.warnings[0]?.nodeId).toBe("schedule");

    const view = asView(collectIssues(document));
    expect(view.valid).toBe(true);
    expect(view.issues.filter((i) => i.severity === "error")).toHaveLength(0);
    const warnings = view.issues.filter((i) => i.severity === "warning");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.nodeId).toBe("schedule");
    expect(warnings[0]?.code).toBe("SCHEDULE_NOT_PUBLISHABLE");
  });
});

describe("collectIssues — gom nhiều lỗi ajv của một node thành đúng một issue", () => {
  it("node play mới thiếu mediaId/nextNodeId sinh nhiều lỗi ajv (oneOf) nhưng chỉ đúng 1 INVALID_SHAPE, kèm đúng 1 ORPHAN_NODE", async () => {
    const document = await publishedDocumentOfMainFlow();
    const doc = document as unknown as { nodes: Record<string, unknown> };
    doc.nodes.p2 = { type: "play" };

    expect(checkShape(doc).errors.length).toBeGreaterThan(1);

    const view = asView(collectIssues(doc));
    expect(view.valid).toBe(false);
    const shapeIssues = view.issues.filter((i) => i.code === "INVALID_SHAPE" && i.nodeId === "p2");
    expect(shapeIssues).toHaveLength(1);
    expect(shapeIssues[0]?.message).toContain("mediaId");
    expect(shapeIssues[0]?.message).toContain("nextNodeId");
    const orphanIssues = view.issues.filter((i) => i.code === "ORPHAN_NODE" && i.nodeId === "p2");
    expect(orphanIssues).toHaveLength(1);
  });

  it("phím menu chưa nối (choices['3'] = '') → đúng 1 INVALID_SHAPE (chữ chứa choices) và đúng 1 DANGLING_BRANCH trên node menu", async () => {
    const document = await publishedDocumentOfMainFlow();
    const doc = document as unknown as { nodes: Record<string, { choices?: Record<string, string> }> };
    expect(doc.nodes.menu?.choices, "kịch bản published cần node menu có choices").toBeDefined();
    doc.nodes.menu.choices!["3"] = "";

    const view = asView(collectIssues(doc));
    const shapeIssues = view.issues.filter((i) => i.code === "INVALID_SHAPE" && i.nodeId === "menu");
    expect(shapeIssues).toHaveLength(1);
    expect(shapeIssues[0]?.message).toContain("choices");
    const danglingIssues = view.issues.filter((i) => i.code === "DANGLING_BRANCH" && i.nodeId === "menu");
    expect(danglingIssues).toHaveLength(1);
  });
});

describe("newFlowDocument — bản nháp trống dùng cho kịch bản mới (khoá hợp đồng cho TC-FLOW-024)", () => {
  it("đúng một node start với hai nhánh giữ chỗ chưa nối, khớp pattern, khác nhau, không có trong nodes; qua lớp 1, lớp 2 báo đúng 2 DANGLING_BRANCH và 0 issue khác", () => {
    const doc = newFlowDocument();

    const nodeIds = Object.keys(doc.nodes);
    expect(nodeIds).toHaveLength(1);
    expect(nodeIds[0]).toBe(doc.startNodeId);

    const start = doc.nodes[doc.startNodeId] as { type: string; nextNodeId: string; fallbackNodeId: string };
    expect(start.type).toBe("start");
    expect(start.nextNodeId).not.toBe(start.fallbackNodeId);
    expect(start.nextNodeId).toMatch(PATTERN_NODE_ID);
    expect(start.fallbackNodeId).toMatch(PATTERN_NODE_ID);
    expect(Object.hasOwn(doc.nodes, start.nextNodeId)).toBe(false);
    expect(Object.hasOwn(doc.nodes, start.fallbackNodeId)).toBe(false);

    expect(checkShape(doc).ok).toBe(true);

    const view = asView(collectIssues(doc));
    expect(view.valid).toBe(false);
    const dangling = view.issues.filter((i) => i.code === "DANGLING_BRANCH" && i.nodeId === doc.startNodeId);
    expect(dangling).toHaveLength(2);
    expect(dangling[0]?.message).not.toBe(dangling[1]?.message);
    expect(view.issues).toHaveLength(2);
  });

  it("gọi hai lần trả hai object khác nhau — sửa bản này không đổi bản kia", () => {
    const a = newFlowDocument();
    const b = newFlowDocument();
    expect(a).not.toBe(b);
    expect(a.nodes).not.toBe(b.nodes);

    const aStart = a.nodes[a.startNodeId] as { label?: string };
    aStart.label = "bi-sua-ban-a";
    const bStart = b.nodes[b.startNodeId] as { label?: string };
    expect(bStart.label).not.toBe("bi-sua-ban-a");
  });
});

describe("collectIssues — đầu vào bất thường không ném", () => {
  it("không còn node Bắt đầu: startNodeId rỗng → không ném, INVALID_START và INVALID_SHAPE không nodeId, node hangup sạch", () => {
    const doc = { schemaVersion: "1.1.0", startNodeId: "", nodes: { h: { type: "hangup" } } };

    expect(() => collectIssues(doc)).not.toThrow();
    const view = asView(collectIssues(doc));
    expect(view.valid).toBe(false);

    const invalidStart = view.issues.filter((i) => i.code === "INVALID_START" && i.nodeId === undefined);
    expect(invalidStart.length).toBeGreaterThanOrEqual(1);
    const invalidShapeNoNode = view.issues.filter((i) => i.code === "INVALID_SHAPE" && i.nodeId === undefined);
    expect(invalidShapeNoNode.length).toBeGreaterThanOrEqual(1);
    const hIssues = view.issues.filter((i) => i.nodeId === "h");
    expect(hIssues).toHaveLength(0);
  });

  it.each([[{}], [null], [{ nodes: 1 }]])("đầu vào rác %j không ném, valid false", (input) => {
    expect(() => collectIssues(input)).not.toThrow();
    expect(asView(collectIssues(input)).valid).toBe(false);
  });

  it("id __proto__ hợp lệ theo schema (dựng bằng JSON.parse của chuỗi JSON, không phải object literal) vẫn được gắn issue riêng", () => {
    // Object literal với khoá `__proto__:` sẽ đặt prototype thay vì tạo
    // thuộc tính riêng — phải viết chuỗi JSON tay và JSON.parse (như ca
    // "khoá hợp đồng cho lô 4" ở src/flow/canvas.test.ts).
    const doc = JSON.parse(
      '{"schemaVersion":"1.1.0","startNodeId":"start1","nodes":{"start1":{"type":"start","nextNodeId":"__proto__","fallbackNodeId":"hangup1"},"__proto__":{"type":"play"},"hangup1":{"type":"hangup"}}}',
    ) as { nodes: Record<string, unknown> };
    expect(Object.hasOwn(doc.nodes, "__proto__")).toBe(true);

    const view = asView(collectIssues(doc));
    const protoIssues = view.issues.filter((i) => i.code === "INVALID_SHAPE" && i.nodeId === "__proto__");
    expect(protoIssues).toHaveLength(1);
  });
});
