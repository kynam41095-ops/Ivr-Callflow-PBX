import { describe, expect, it } from "vitest";
import { toCanvas, fromCanvas } from "./canvas";
import { checkShape, checkGraph } from "./validate";
import { listFlows, listVersions, getVersion } from "../data/api";

/**
 * Hợp đồng (vai test và vai code cùng bám, `3-plan-02…md` mục "Files that change"):
 *   toCanvas(doc) → { nodes, edges }        (hình dạng Node/Edge của @xyflow/react)
 *   fromCanvas(nodes, edges) → FlowDocument
 * `fromCanvas` giữ nguyên nhánh treo (target cũ không có cạnh mới và
 * không còn tồn tại trong nodes vẫn được giữ) — đây là điều AC-20 lô 4
 * dựa vào, khoá bằng unit test ở lô này (Tự quyết iter 2 dòng "fromCanvas").
 */

function withoutCanvas(doc: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...doc };
  delete rest.canvas;
  return rest;
}

describe("TC-FLOW-019 — chuyển đổi hai chiều không mất dữ liệu", () => {
  it("TC-FLOW-019: với mọi kịch bản giả lập, toCanvas rồi fromCanvas cho kết quả bằng bản gốc ở mọi khoá trừ canvas", async () => {
    const flows = await listFlows();
    expect(flows.length).toBeGreaterThanOrEqual(1);

    const allTypes = new Set<string>();
    let checked = 0;

    for (const flow of flows) {
      const versions = await listVersions(flow.id);
      for (const version of versions) {
        const { document } = await getVersion(flow.id, version.id);
        const doc = document as Record<string, unknown>;
        for (const node of Object.values(doc.nodes as Record<string, Record<string, unknown>>)) {
          allTypes.add(node.type as string);
        }

        const { nodes, edges } = toCanvas(doc);
        const roundtripped = fromCanvas(nodes, edges) as unknown as Record<string, unknown>;

        expect(withoutCanvas(roundtripped)).toStrictEqual(withoutCanvas(doc));
        expect(checkShape(roundtripped).ok).toBe(true);
        checked += 1;
      }
    }

    expect(checked).toBeGreaterThanOrEqual(1);
    expect(allTypes.has("start")).toBe(true);
    expect(allTypes.has("play")).toBe(true);
    expect(allTypes.has("menu")).toBe(true);
    expect(allTypes.has("queue")).toBe(true);
    expect(allTypes.has("hangup")).toBe(true);
    expect(allTypes.has("schedule")).toBe(true);
  });
});

describe("ca không mang mã — khoá hợp đồng cho lô 3, 4", () => {
  it("nextNodeId treo (đích không tồn tại) sống sót qua toCanvas rồi fromCanvas — không tự sinh cạnh cho nó", () => {
    const doc = {
      schemaVersion: "1.1.0",
      startNodeId: "start1",
      nodes: {
        start1: { type: "start", nextNodeId: "play1", fallbackNodeId: "hangup1" },
        play1: {
          type: "play",
          mediaId: "11111111-1111-1111-1111-111111111111",
          nextNodeId: "treo-khong-ton-tai",
        },
        hangup1: { type: "hangup" },
      },
    };

    const { nodes, edges } = toCanvas(doc);
    const playEdges = edges.filter((e) => e.source === "play1");
    expect(playEdges).toHaveLength(0);

    const back = fromCanvas(nodes, edges) as unknown as Record<string, unknown>;
    const backNodes = back.nodes as Record<string, Record<string, unknown>>;
    expect(backNodes.play1?.nextNodeId).toBe("treo-khong-ton-tai");
  });

  it("thêm cạnh sourceHandle 'fallback' sang node khác → fromCanvas đổi fallbackNodeId theo cạnh mới", () => {
    const doc = {
      schemaVersion: "1.1.0",
      startNodeId: "start1",
      nodes: {
        start1: { type: "start", nextNodeId: "play1", fallbackNodeId: "hangup1" },
        play1: {
          type: "play",
          mediaId: "11111111-1111-1111-1111-111111111111",
          nextNodeId: "hangup1",
        },
        hangup1: { type: "hangup" },
      },
    };

    const { nodes, edges } = toCanvas(doc);
    const withoutOldFallback = edges.filter(
      (e) => !(e.source === "start1" && e.sourceHandle === "fallback"),
    );
    const newEdge = {
      id: "e-start1-fallback-nguoi-dung-doi",
      source: "start1",
      sourceHandle: "fallback",
      target: "play1",
    };

    const back = fromCanvas(nodes, [...withoutOldFallback, newEdge]) as unknown as Record<string, unknown>;
    const backNodes = back.nodes as Record<string, Record<string, unknown>>;
    expect(backNodes.start1?.fallbackNodeId).toBe("play1");
  });

  it("id node __proto__ sống sót qua toCanvas rồi fromCanvas (không đổi prototype)", () => {
    // Dựng bằng JSON.parse của một chuỗi JSON viết tay: object literal với khoá
    // `__proto__:` sẽ đặt prototype thay vì tạo thuộc tính riêng — JSON.parse
    // của text luôn tạo thuộc tính riêng, đúng thứ cần kiểm.
    const doc = JSON.parse(`{
      "schemaVersion": "1.1.0",
      "startNodeId": "start1",
      "nodes": {
        "start1": { "type": "start", "nextNodeId": "__proto__", "fallbackNodeId": "__proto__" },
        "__proto__": { "type": "hangup" }
      },
      "canvas": {
        "positions": {
          "start1": { "x": 0, "y": 0 },
          "__proto__": { "x": 100, "y": 100 }
        }
      }
    }`) as Record<string, unknown>;
    expect(Object.hasOwn(doc.nodes as Record<string, unknown>, "__proto__")).toBe(true);

    expect(checkShape(doc).ok).toBe(true);
    expect(checkGraph(doc).errors).toEqual([]);

    const { nodes, edges } = toCanvas(doc);
    const back = fromCanvas(nodes, edges) as unknown as Record<string, unknown>;
    const backNodes = back.nodes as Record<string, Record<string, unknown>>;
    const backPositions = (back.canvas as Record<string, unknown>).positions as Record<
      string,
      Record<string, unknown>
    >;

    expect(Object.hasOwn(backNodes, "__proto__")).toBe(true);
    expect(Object.hasOwn(backPositions, "__proto__")).toBe(true);
    expect(withoutCanvas(back)).toStrictEqual(withoutCanvas(doc));
    expect(checkShape(back).ok).toBe(true);
    expect(checkGraph(back).errors).toEqual([]);
    expect(Object.hasOwn(JSON.parse(JSON.stringify(back)).nodes, "__proto__")).toBe(true);
  });
});
