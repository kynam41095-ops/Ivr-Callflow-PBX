import type { FlowNode } from "./types";

// Bảng duy nhất ánh xạ trường trỏ của tài liệu ↔ id điểm nối trên canvas.
// Lớp 2 (validate), chuyển đổi canvas và node của lô 3 đều đi qua đây,
// không nơi nào gõ tay tên điểm nối.
export type BranchRef = {
  handle: string;
  field: string;
  choiceKey?: string;
  target: string | undefined;
};

// Tài liệu có thể sai hình dạng (lô 4 gọi cả khi lớp 1 đỏ): chỉ nhận
// trường trỏ là chuỗi, mọi giá trị khác coi như không có đích.
function asTarget(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function branchesOf(node: FlowNode): BranchRef[] {
  switch (node.type) {
    case "start":
      return [
        { handle: "next", field: "nextNodeId", target: asTarget(node.nextNodeId) },
        { handle: "fallback", field: "fallbackNodeId", target: asTarget(node.fallbackNodeId) },
      ];
    case "play":
      return [{ handle: "next", field: "nextNodeId", target: asTarget(node.nextNodeId) }];
    case "menu": {
      const branches: BranchRef[] = [];
      if (node.choices && typeof node.choices === "object") {
        for (const [key, value] of Object.entries(node.choices)) {
          branches.push({
            handle: `choice-${key}`,
            field: "choices",
            choiceKey: key,
            target: asTarget(value),
          });
        }
      }
      branches.push({
        handle: "timeout",
        field: "onTimeoutNodeId",
        target: asTarget(node.onTimeoutNodeId),
      });
      branches.push({
        handle: "invalid",
        field: "onInvalidNodeId",
        target: asTarget(node.onInvalidNodeId),
      });
      return branches;
    }
    case "schedule":
      return [
        { handle: "open", field: "onOpenNodeId", target: asTarget(node.onOpenNodeId) },
        { handle: "closed", field: "onClosedNodeId", target: asTarget(node.onClosedNodeId) },
      ];
    default:
      return [];
  }
}
