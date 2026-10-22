import schema from "../../contracts/flow-document.schema.json";
import { checkGraph, checkShape } from "../flow/validate";

// Dấu kiểm hợp lệ tại chỗ của trình dựng (lô 4). NodeIssue bám ValidationResult
// của builder-api.yaml cộng trường severity chỉ-giao-diện (không gửi máy chủ).
// collectIssues là hàm thuần, không import React, không ném với mọi đầu vào.
// Luôn chạy cả hai lớp kể cả khi lớp 1 đỏ (3-plan-04 mục "Files that change").

export type NodeIssue = {
  code: string;
  message: string;
  severity: "error" | "warning";
  nodeId?: string;
};

export type ValidationView = {
  valid: boolean;
  issues: NodeIssue[];
};

// Mã lớp 1 trên giao diện — một dấu mỗi node (plan.md Tự quyết iter 8).
const INVALID_SHAPE = "INVALID_SHAPE";
const NODE_PATH = /^\/nodes\/([^/]+)/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// required của $defs["<type>Node"] đọc từ file schema, không gõ tay.
function requiredFields(type: string): string[] {
  const defs = (schema as { $defs?: Record<string, { required?: unknown }> }).$defs;
  const required = defs?.[`${type}Node`]?.required;
  return Array.isArray(required)
    ? required.filter((field): field is string => typeof field === "string")
    : [];
}

// Câu thông báo một node sai định dạng: nêu trường required của đúng loại node
// (theo data.type) còn thiếu, và các đường dẫn con dưới node khác type (vd
// choices/3). Không đọc schemaPath của ajv — nhánh oneOf inline không mang tên
// $defs (3-plan-04).
function nodeShapeMessage(
  nodes: Record<string, unknown>,
  id: string,
  subPaths: ReadonlySet<string>,
): string {
  const nodeData = Object.hasOwn(nodes, id) ? nodes[id] : undefined;
  const type = isRecord(nodeData) && typeof nodeData.type === "string" ? nodeData.type : "";
  const missing = requiredFields(type).filter(
    (field) => !isRecord(nodeData) || !Object.hasOwn(nodeData, field),
  );
  const parts: string[] = [];
  if (missing.length > 0) {
    parts.push(`thiếu ${missing.join(", ")}`);
  }
  const paths = [...subPaths].filter((path) => path !== "type" && !path.startsWith("type/"));
  if (paths.length > 0) {
    parts.push(`sai ở ${paths.join(", ")}`);
  }
  return parts.length > 0
    ? `Bước sai định dạng theo lược đồ: ${parts.join("; ")}.`
    : "Bước sai định dạng theo lược đồ.";
}

export function collectIssues(doc: unknown): ValidationView {
  const shape = checkShape(doc);
  const graph = checkGraph(doc);
  // Cảnh báo không làm valid thành false; chỉ lỗi lớp 1 hoặc lớp 2 mới làm vậy.
  const valid = shape.ok && graph.errors.length === 0;

  const nodes = isRecord(doc) && isRecord(doc.nodes) ? doc.nodes : undefined;

  // Lớp 1 → node: gom mọi lỗi ajv theo id node (ajv oneOf trả ~20 mục mỗi node
  // sai). Lỗi không nằm dưới một node có thật thì gom theo instancePath, không
  // nodeId. Dùng Map — id `__proto__` hợp lệ theo schema (review lô 2).
  const subPathsByNode = new Map<string, Set<string>>();
  const loosePaths = new Set<string>();

  for (const error of shape.errors) {
    const id = NODE_PATH.exec(error.instancePath)?.[1];
    if (id !== undefined && nodes !== undefined && Object.hasOwn(nodes, id)) {
      let subPaths = subPathsByNode.get(id);
      if (subPaths === undefined) {
        subPaths = new Set();
        subPathsByNode.set(id, subPaths);
      }
      const sub = error.instancePath.slice(`/nodes/${id}`.length + 1);
      if (sub !== "") {
        subPaths.add(sub);
      }
    } else {
      loosePaths.add(error.instancePath);
    }
  }

  const issues: NodeIssue[] = [];
  if (nodes !== undefined) {
    for (const [id, subPaths] of subPathsByNode) {
      issues.push({
        code: INVALID_SHAPE,
        message: nodeShapeMessage(nodes, id, subPaths),
        severity: "error",
        nodeId: id,
      });
    }
  }
  for (const path of loosePaths) {
    issues.push({
      code: INVALID_SHAPE,
      message:
        path === ""
          ? "Tài liệu thiếu hoặc sai trường bắt buộc."
          : `Tài liệu sai định dạng tại ${path}.`,
      severity: "error",
    });
  }

  // Lớp 2: errors → severity error, warnings → severity warning; giữ code,
  // message, nodeId của checkGraph. Khử trùng lặp theo severity + code + nodeId
  // + message (message của DANGLING_BRANCH chứa tên điểm nối và id đích nên hai
  // nhánh treo của cùng node không bị gộp).
  const seen = new Set<string>();
  const addGraphIssues = (
    list: ReadonlyArray<{ code: string; message: string; nodeId?: string }>,
    severity: "error" | "warning",
  ) => {
    for (const item of list) {
      const key = `${severity}\u0000${item.code}\u0000${item.nodeId ?? ""}\u0000${item.message}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const issue: NodeIssue = { code: item.code, message: item.message, severity };
      if (item.nodeId !== undefined) {
        issue.nodeId = item.nodeId;
      }
      issues.push(issue);
    }
  };
  addGraphIssues(graph.errors, "error");
  addGraphIssues(graph.warnings, "warning");

  return { valid, issues };
}
