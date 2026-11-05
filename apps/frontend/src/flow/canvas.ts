import type { Edge, Node } from "@xyflow/react";
import { branchesOf, type BranchRef } from "./branches";
import type { FlowDocument, FlowNode } from "./types";

// Chuyển đổi hai chiều tài liệu kịch bản ↔ hình dạng Node/Edge của
// @xyflow/react. Nguồn chuẩn của trường trỏ là data của node (cạnh chỉ phủ
// lên) — §3.3: cạnh không phải thực thể của tài liệu.

const GRID_STEP_X = 240;
const GRID_STEP_Y = 160;
const GRID_COLUMNS = 4;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function edgeKey(source: string, handle: string): string {
  return `${source}\u0000${handle}`;
}

export function toCanvas(doc: Record<string, unknown>): { nodes: Node[]; edges: Edge[] } {
  const nodesRecord = isRecord(doc.nodes) ? doc.nodes : {};
  const ids = Object.keys(nodesRecord);
  const startNodeId = typeof doc.startNodeId === "string" ? doc.startNodeId : undefined;

  // Node điểm vào đứng đầu mảng — fromCanvas dựa vào quy ước này để lấy
  // lại startNodeId.
  const orderedIds =
    startNodeId !== undefined && Object.hasOwn(nodesRecord, startNodeId)
      ? [startNodeId, ...ids.filter((id) => id !== startNodeId)]
      : ids;

  const canvas = isRecord(doc.canvas) ? doc.canvas : undefined;
  const positions = canvas && isRecord(canvas.positions) ? canvas.positions : {};

  const nodes: Node[] = orderedIds.map((id, index) => {
    const data = nodesRecord[id];
    const position = positions[id];
    return {
      id,
      ...(isRecord(data) && typeof data.type === "string" ? { type: data.type } : {}),
      position:
        isRecord(position) && typeof position.x === "number" && typeof position.y === "number"
          ? { x: position.x, y: position.y }
          : { x: (index % GRID_COLUMNS) * GRID_STEP_X, y: Math.floor(index / GRID_COLUMNS) * GRID_STEP_Y },
      data: isRecord(data) ? data : {},
    };
  });

  const edges: Edge[] = [];
  for (const id of orderedIds) {
    const data = nodesRecord[id];
    if (!isRecord(data)) {
      continue;
    }
    for (const branch of branchesOf(data as FlowNode)) {
      // Đích không tồn tại thì không sinh cạnh — React Flow cảnh báo khi
      // cạnh trỏ vào node không có. Nhánh treo nằm lại trong data.
      if (branch.target !== undefined && Object.hasOwn(nodesRecord, branch.target)) {
        edges.push({
          id: `e-${id}-${branch.handle}`,
          source: id,
          sourceHandle: branch.handle,
          target: branch.target,
        });
      }
    }
  }

  return { nodes, edges };
}

function setBranchTarget(node: Record<string, unknown>, branch: BranchRef, target: string): void {
  if (branch.choiceKey !== undefined) {
    const choices = isRecord(node.choices) ? node.choices : {};
    choices[branch.choiceKey] = target;
    node.choices = choices;
  } else {
    node[branch.field] = target;
  }
}

function clearBranchTarget(node: Record<string, unknown>, branch: BranchRef): void {
  if (branch.choiceKey !== undefined) {
    if (isRecord(node.choices)) {
      delete node.choices[branch.choiceKey];
    }
  } else {
    delete node[branch.field];
  }
}

export function fromCanvas(nodes: Node[], edges: Edge[]): FlowDocument {
  const nodeIds = new Set(nodes.map((node) => node.id));

  // Nhiều cạnh cùng một handle thì cạnh sau thắng.
  const edgeByHandle = new Map<string, Edge>();
  for (const edge of edges) {
    if (typeof edge.sourceHandle === "string") {
      edgeByHandle.set(edgeKey(edge.source, edge.sourceHandle), edge);
    }
  }

  const nodeEntries: [string, FlowNode][] = [];
  const positionEntries: [string, { x: number; y: number }][] = [];
  let startNodeId = "";

  for (const node of nodes) {
    const data = node.data as Record<string, unknown>;
    // Bản sao — không mutate data, nó nằm trong state React Flow của lô 3, 4.
    const copy: Record<string, unknown> = { ...data };
    if (isRecord(copy.choices)) {
      copy.choices = { ...copy.choices };
    }

    for (const branch of branchesOf(copy as unknown as FlowNode)) {
      const edge = edgeByHandle.get(edgeKey(node.id, branch.handle));
      if (edge) {
        setBranchTarget(copy, branch, edge.target);
      } else if (typeof branch.target === "string" && nodeIds.has(branch.target)) {
        // Không có cạnh mà đích cũ còn tồn tại: người dùng đã xoá cạnh.
        clearBranchTarget(copy, branch);
      }
      // Không có cạnh mà đích cũ không tồn tại: giữ nhánh treo để lớp 2
      // còn báo được DANGLING_BRANCH (AC-20 lô 4).
    }

    nodeEntries.push([node.id, copy as FlowNode]);
    positionEntries.push([node.id, { x: node.position.x, y: node.position.y }]);
    if (startNodeId === "" && isRecord(data) && data.type === "start") {
      startNodeId = node.id;
    }
  }

  // Object.fromEntries tạo thuộc tính riêng cho mọi id — gán object[id] trên
  // {} thô sẽ đổi prototype nếu id là `__proto__` (id hợp lệ theo $defs/nodeId).
  const docNodes = Object.fromEntries(nodeEntries);
  const positions = Object.fromEntries(positionEntries);

  return {
    schemaVersion: "1.1.0",
    startNodeId,
    nodes: docNodes,
    canvas: { positions },
  };
}
