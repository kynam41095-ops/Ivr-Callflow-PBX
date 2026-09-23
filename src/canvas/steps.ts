// Bảng duy nhất cho giao diện của sáu loại bước: nhãn palette, nhãn điểm
// nối nguồn và data của node mới. Tên điểm nối không gõ tay ở đây — sinh từ
// branchesOf (src/flow/branches.ts); bảng này chỉ dịch handle sang chữ hiển
// thị (Tự quyết iter 5 của plan.md).

import type { FlowDocument } from "../flow/types";

export type StepType = "start" | "play" | "menu" | "queue" | "hangup" | "schedule";

export const STEP_TYPES: ReadonlyArray<{ type: StepType; label: string }> = [
  { type: "start", label: "Bắt đầu" },
  { type: "play", label: "Phát lời thoại" },
  { type: "menu", label: "Menu phím bấm" },
  { type: "queue", label: "Chuyển hàng đợi" },
  { type: "hangup", label: "Kết thúc" },
  { type: "schedule", label: "Điều kiện theo lịch" },
];

const CHOICE_PREFIX = "choice-";

const BRANCH_LABELS: Record<string, Record<string, string>> = {
  start: { next: "Nhánh chính", fallback: "Nhánh dự phòng" },
  play: { next: "Tiếp theo" },
  menu: { timeout: "Không bấm", invalid: "Bấm sai" },
  schedule: { open: "Trong giờ", closed: "Ngoài giờ" },
};

export function stepLabel(type: string): string {
  return STEP_TYPES.find((step) => step.type === type)?.label ?? type;
}

export function branchLabel(type: string, handle: string): string {
  if (handle.startsWith(CHOICE_PREFIX)) {
    return handle.slice(CHOICE_PREFIX.length);
  }
  return BRANCH_LABELS[type]?.[handle] ?? handle;
}

// data của node mới thả từ palette: chỉ trường có trong $defs của
// flow-document.schema.json. Trường bắt buộc còn thiếu (mediaId,
// nextNodeId…) để trống — lô 4 báo lỗi khi kiểm hợp lệ.
export function newNodeData(type: StepType): Record<string, unknown> {
  const data: Record<string, unknown> = { type, label: stepLabel(type) };
  if (type === "menu") {
    data.choices = {};
    data.timeoutSeconds = 5; // giá trị default của schema
  }
  if (type === "schedule") {
    data.timezone = "Asia/Ho_Chi_Minh";
    data.rules = [{ time: { from: "08:00", to: "17:00" } }];
  }
  return data;
}

export const NEW_FLOW_NAME = "Kịch bản mới";

// Bản nháp trống cho kịch bản mới (Tự quyết iter 8 của plan.md): chỉ node Bắt
// đầu, hai nhánh trỏ id giữ chỗ khớp pattern $defs/nodeId nhưng chưa tồn tại
// trong nodes → qua lớp 1, lớp 2 báo đúng 2 DANGLING_BRANCH (AC-20). Hai id
// không phải uuid nên không bao giờ trùng id node sinh từ palette. Mỗi lần
// gọi trả object mới — sửa bản này không đổi bản kia.
export function newFlowDocument(): FlowDocument {
  return {
    schemaVersion: "1.1.0",
    startNodeId: "start",
    nodes: {
      start: {
        type: "start",
        label: "Bắt đầu",
        nextNodeId: "chua-noi-nhanh-chinh",
        fallbackNodeId: "chua-noi-nhanh-du-phong",
      },
    },
    canvas: { positions: { start: { x: 0, y: 0 } } },
  };
}
