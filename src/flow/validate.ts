import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import type { ErrorObject } from "ajv";
import schema from "../../contracts/flow-document.schema.json";
import { branchesOf } from "./branches";
import type { FlowNode } from "./types";

// Lớp 1: hình dạng tài liệu theo contracts/flow-document.schema.json.
// Biên dịch một lần ở cấp module; allErrors để lô 4 gắn lỗi lên mọi node sai.
const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const validateDocument = ajv.compile(schema);

export type Issue = {
  code: string;
  message: string;
  nodeId?: string;
};

export type ShapeResult = { ok: boolean; errors: ErrorObject[] };
export type GraphResult = { errors: Issue[]; warnings: Issue[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function checkShape(doc: unknown): ShapeResult {
  const ok = validateDocument(doc) as boolean;
  return { ok, errors: validateDocument.errors ?? [] };
}

// Lớp 2: đồ thị nhánh. Không ném khi tài liệu sai hình dạng — lô 4 chạy
// hàm này cả khi lớp 1 đỏ, nên chỉ đọc trường trỏ khi là chuỗi.
export function checkGraph(doc: unknown): GraphResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];

  const nodes = isRecord(doc) && isRecord(doc.nodes) ? doc.nodes : undefined;
  if (!nodes) {
    return { errors, warnings };
  }
  const ids = Object.keys(nodes);
  const startNodeId =
    isRecord(doc) && typeof doc.startNodeId === "string" ? doc.startNodeId : undefined;

  // (1) Điểm vào phải trỏ tới một node start có thật.
  const startNode = startNodeId !== undefined ? nodes[startNodeId] : undefined;
  const startIsValid = isRecord(startNode) && startNode.type === "start";
  if (!startIsValid) {
    const issue: Issue = {
      code: "INVALID_START",
      message: "Điểm vào của kịch bản phải trỏ tới một bước Bắt đầu.",
    };
    if (startNodeId !== undefined && Object.hasOwn(nodes, startNodeId)) {
      issue.nodeId = startNodeId;
    }
    errors.push(issue);
  }

  // (2) Mỗi trường trỏ / mỗi phím trỏ vào node không tồn tại: một issue,
  // không gom theo node.
  for (const id of ids) {
    const node = nodes[id];
    if (!isRecord(node)) {
      continue;
    }
    for (const branch of branchesOf(node as FlowNode)) {
      if (typeof branch.target === "string" && !Object.hasOwn(nodes, branch.target)) {
        errors.push({
          code: "DANGLING_BRANCH",
          message: `Nhánh "${branch.handle}" trỏ tới bước "${branch.target}" không tồn tại trong kịch bản.`,
          nodeId: id,
        });
      }
    }
  }

  // (3) Mọi node phải tới được từ điểm vào (BFS). Điểm vào hỏng thì bỏ qua
  // bước này — báo INVALID_START là đủ, không gắn cờ toàn bộ kịch bản.
  if (startIsValid && startNodeId !== undefined) {
    const reached = new Set<string>([startNodeId]);
    const pending: string[] = [startNodeId];
    while (pending.length > 0) {
      const current = pending.shift() as string;
      const node = nodes[current];
      if (!isRecord(node)) {
        continue;
      }
      for (const branch of branchesOf(node as FlowNode)) {
        const target = branch.target;
        if (
          typeof target === "string" &&
          Object.hasOwn(nodes, target) &&
          !reached.has(target)
        ) {
          reached.add(target);
          pending.push(target);
        }
      }
    }
    for (const id of ids) {
      if (!reached.has(id)) {
        errors.push({
          code: "ORPHAN_NODE",
          message: `Bước "${id}" không có đường đi tới từ bước Bắt đầu.`,
          nodeId: id,
        });
      }
    }
  }

  // (4) Node schedule chưa ban hành được ở đợt 1 (Ràng buộc 9) — cảnh báo.
  for (const id of ids) {
    const node = nodes[id];
    if (isRecord(node) && node.type === "schedule") {
      warnings.push({
        code: "SCHEDULE_NOT_PUBLISHABLE",
        message: `Bước "${id}" là Điều kiện theo lịch — chưa ban hành được ở đợt này.`,
        nodeId: id,
      });
    }
  }

  return { errors, warnings };
}
