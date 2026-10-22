import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { checkShape, checkGraph } from "./validate";
import { schemaFilePath } from "../contracts.node";
import { listFlows, listVersions, getVersion } from "../data/api";

/**
 * Hợp đồng hàm (vai test và vai code cùng bám, theo `plan.md` lô 2 và
 * `3-plan-02…md` mục "Files that change"):
 *   checkShape(doc: unknown) → { ok: boolean; errors: ErrorObject[] }   (ajv thô, lớp 1)
 *   checkGraph(doc: unknown) → { errors: Issue[]; warnings: Issue[] }  (lớp 2)
 *   Issue = { code: string; message: string; nodeId?: string }
 * Mã: ORPHAN_NODE, DANGLING_BRANCH, INVALID_START, SCHEDULE_NOT_PUBLISHABLE.
 *
 * `checkGraph` định nghĩa ORPHAN_NODE bằng BFS từ startNodeId (Tự quyết
 * iter 2 dòng 2, không phải "không nhánh nào trỏ tới" của mô tả schema).
 */

const SIX_TYPES = ["start", "play", "menu", "queue", "hangup", "schedule"] as const;

const MEDIA_A = "11111111-1111-1111-1111-111111111111";
const MEDIA_B = "22222222-2222-2222-2222-222222222222";

/** Tài liệu nền hợp lệ, đủ sáu loại node, mọi node tới được từ start. */
function baseDoc(): Record<string, unknown> {
  return {
    schemaVersion: "1.1.0",
    startNodeId: "start1",
    nodes: {
      start1: { type: "start", nextNodeId: "play1", fallbackNodeId: "hangup1" },
      play1: { type: "play", mediaId: MEDIA_A, nextNodeId: "menu1" },
      menu1: {
        type: "menu",
        promptMediaId: MEDIA_B,
        choices: { "1": "queue1", "2": "schedule1" },
        timeoutSeconds: 5,
        onTimeoutNodeId: "hangup1",
        onInvalidNodeId: "hangup1",
      },
      queue1: { type: "queue", queueRef: "sales" },
      schedule1: {
        type: "schedule",
        timezone: "UTC",
        rules: [{ time: { from: "08:00", to: "17:00" } }],
        onOpenNodeId: "queue1",
        onClosedNodeId: "hangup1",
      },
      hangup1: { type: "hangup" },
    },
  };
}

function nodesOf(doc: Record<string, unknown>): Record<string, Record<string, unknown>> {
  return doc.nodes as Record<string, Record<string, unknown>>;
}

describe("tài liệu nền tự kiểm — không phải AC, chỉ chống test tự chứng minh chính nó", () => {
  it("baseDoc() qua sạch cả hai lớp trước khi bị mutate cho các ca âm tính", () => {
    const doc = baseDoc();
    expect(checkShape(doc).ok).toBe(true);
    const graph = checkGraph(doc);
    expect(graph.errors).toHaveLength(0);
  });
});

describe("TC-FLOW-014 — mọi kịch bản giả lập qua sạch cả hai lớp; hash schema khoá", () => {
  it("TC-FLOW-014: mọi phiên bản của mọi kịch bản lấy qua ranh giới dữ liệu có 0 lỗi lớp 1 và 0 lỗi lớp 2; tập type phủ đủ sáu loại", async () => {
    const flows = await listFlows();
    expect(flows.length).toBeGreaterThanOrEqual(1);

    const allTypes = new Set<string>();
    let documentCount = 0;

    for (const flow of flows) {
      const versions = await listVersions(flow.id);
      expect(versions.length).toBeGreaterThanOrEqual(1);
      for (const version of versions) {
        const { document } = await getVersion(flow.id, version.id);
        documentCount += 1;

        const shape = checkShape(document);
        expect(shape.errors, `checkShape lỗi trên flow ${flow.id} version ${version.id}`).toEqual([]);
        expect(shape.ok).toBe(true);

        const graph = checkGraph(document);
        expect(graph.errors, `checkGraph lỗi trên flow ${flow.id} version ${version.id}`).toEqual([]);

        for (const node of Object.values(nodesOf(document as Record<string, unknown>))) {
          allTypes.add(node.type as string);
        }
      }
    }

    expect(documentCount).toBeGreaterThanOrEqual(1);
    expect([...allTypes].sort()).toEqual([...SIX_TYPES].sort());
  });

  it("TC-FLOW-014: sha256 của contracts/flow-document.schema.json (sau chuẩn hoá CRLF→LF) khớp blob Docs 831b0fe", () => {
    const schemaPath = schemaFilePath;
    const raw = readFileSync(schemaPath, "utf8");
    const normalized = raw.replace(/\r\n/g, "\n");
    const hash = createHash("sha256").update(normalized).digest("hex");
    expect(hash).toBe("869a5d0018bdd6476c2aef489b15ff8e1664e44d5dafa803494226627b1923da");
  });
});

describe("TC-FLOW-015 — mẫu âm tính lớp 2: node không đường tới được (mồ côi)", () => {
  it("TC-FLOW-015: node hangup không nhánh nào trỏ tới → lớp 1 hợp lệ, lớp 2 đúng 1 ORPHAN_NODE", () => {
    const doc = baseDoc();
    nodesOf(doc).orphan1 = { type: "hangup" };

    expect(checkShape(doc).ok).toBe(true);

    const graph = checkGraph(doc);
    expect(graph.errors).toHaveLength(1);
    expect(graph.errors[0]?.code).toBe("ORPHAN_NODE");
    expect(graph.errors[0]?.nodeId).toBe("orphan1");
  });
});

describe("TC-FLOW-026 — mẫu âm tính lớp 2: nhánh trỏ vào node không tồn tại", () => {
  it("TC-FLOW-026: playNode.nextNodeId trỏ id hợp pattern nhưng không có trong nodes → lớp 1 hợp lệ, lớp 2 DANGLING_BRANCH", () => {
    const doc = baseDoc();
    nodesOf(doc).play1 = { type: "play", mediaId: MEDIA_A, nextNodeId: "khong-ton-tai" };

    expect(checkShape(doc).ok).toBe(true);

    const graph = checkGraph(doc);
    const issue = graph.errors.find((e) => e.code === "DANGLING_BRANCH" && e.nodeId === "play1");
    expect(issue).toBeDefined();
    expect(issue?.message).toContain("khong-ton-tai");
  });
});

describe("TC-FLOW-016 — mẫu âm tính lớp 1: startNode thiếu fallbackNodeId", () => {
  it("TC-FLOW-016: startNode không khai fallbackNodeId → lớp 1 không hợp lệ, lỗi required missingProperty fallbackNodeId", () => {
    const doc = baseDoc();
    nodesOf(doc).start1 = { type: "start", nextNodeId: "play1" };

    const shape = checkShape(doc);
    expect(shape.ok).toBe(false);
    const match = shape.errors.find(
      (e) =>
        e.keyword === "required" &&
        e.params?.missingProperty === "fallbackNodeId" &&
        e.instancePath === "/nodes/start1",
    );
    expect(match).toBeDefined();
  });
});

describe("TC-FLOW-017 — mẫu âm tính lớp 1: queueNode có cổng ra thừa", () => {
  it("TC-FLOW-017: queueNode mang thêm nextNodeId → lớp 1 không hợp lệ, lỗi additionalProperties", () => {
    const doc = baseDoc();
    nodesOf(doc).queue1 = { type: "queue", queueRef: "sales", nextNodeId: "hangup1" };

    const shape = checkShape(doc);
    expect(shape.ok).toBe(false);
    const match = shape.errors.find(
      (e) =>
        e.keyword === "additionalProperties" &&
        e.params?.additionalProperty === "nextNodeId" &&
        e.instancePath === "/nodes/queue1",
    );
    expect(match).toBeDefined();
  });
});

describe("TC-FLOW-018 — mẫu âm tính lớp 1: menuNode thiếu nhánh bấm sai", () => {
  it("TC-FLOW-018: menuNode có onTimeoutNodeId nhưng thiếu onInvalidNodeId → lớp 1 không hợp lệ, lỗi required missingProperty onInvalidNodeId", () => {
    const doc = baseDoc();
    const menu = nodesOf(doc).menu1;
    delete (menu as Record<string, unknown>).onInvalidNodeId;

    const shape = checkShape(doc);
    expect(shape.ok).toBe(false);
    const match = shape.errors.find(
      (e) =>
        e.keyword === "required" &&
        e.params?.missingProperty === "onInvalidNodeId" &&
        e.instancePath === "/nodes/menu1",
    );
    expect(match).toBeDefined();
  });
});

describe("TC-FLOW-027 (phần unit) — node schedule mang cảnh báo SCHEDULE_NOT_PUBLISHABLE", () => {
  it("TC-FLOW-027: kịch bản chứa node schedule có 0 lỗi lớp 1, 0 lỗi lớp 2, đúng 1 cảnh báo gắn nodeId của node đó", () => {
    const doc = baseDoc();

    expect(checkShape(doc).ok).toBe(true);
    const graph = checkGraph(doc);
    expect(graph.errors).toHaveLength(0);
    expect(graph.warnings).toHaveLength(1);
    expect(graph.warnings[0]?.code).toBe("SCHEDULE_NOT_PUBLISHABLE");
    expect(graph.warnings[0]?.nodeId).toBe("schedule1");
  });
});

describe("ca không mang mã — khoá hợp đồng cho lô 4 (AC-20 dựa vào đây)", () => {
  it("start có cả nextNodeId lẫn fallbackNodeId trỏ id không tồn tại → lớp 1 hợp lệ, đúng 2 DANGLING_BRANCH cùng nodeId", () => {
    const doc = baseDoc();
    nodesOf(doc).start1 = {
      type: "start",
      nextNodeId: "khong-ton-tai-1",
      fallbackNodeId: "khong-ton-tai-2",
    };

    expect(checkShape(doc).ok).toBe(true);

    const graph = checkGraph(doc);
    const dangling = graph.errors.filter((e) => e.code === "DANGLING_BRANCH" && e.nodeId === "start1");
    expect(dangling).toHaveLength(2);
  });

  it("checkGraph không ném khi tài liệu sai hình dạng: {}, { nodes: 1 }, node thiếu type", () => {
    expect(() => checkGraph({})).not.toThrow();
    expect(() => checkGraph({ nodes: 1 })).not.toThrow();
    expect(() => checkGraph({ startNodeId: "x", nodes: { a: {} } })).not.toThrow();
  });
});
