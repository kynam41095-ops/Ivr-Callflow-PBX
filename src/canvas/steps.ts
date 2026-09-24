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

// Nhãn nhánh theo bảng §3.9 (AC-29, lô 7) — chép nguyên chữ từ lot-brief,
// không tự đặt.
const BRANCH_LABELS: Record<string, Record<string, string>> = {
  start: { next: "Cuộc gọi vào", fallback: "Nhánh dự phòng" },
  play: { next: "Phát xong" },
  menu: { timeout: "Không bấm phím", invalid: "Sai phím" },
  schedule: { open: "Trong giờ", closed: "Ngoài giờ" },
};

// Hậu tố token màu §3.9: menu → dtmf, schedule → time, còn lại giữ tên loại.
const TOKEN_SUFFIX: Record<StepType, string> = {
  start: "start",
  play: "play",
  menu: "dtmf",
  queue: "queue",
  hangup: "hangup",
  schedule: "time",
};

export function tokenSuffix(type: string): string {
  return TOKEN_SUFFIX[type as StepType] ?? type;
}

// Nhánh dự phòng — luôn báo trạng thái lỗi bất kể đã nối hay chưa. Bảng DUY
// NHẤT dùng chung cho thẻ node (FlowNode.tsx) và tô màu cạnh (edges.ts) —
// review vòng 3 lô 7 MINOR "FALLBACK_HANDLES khai hai lần".
export const FALLBACK_HANDLES: Readonly<Record<string, ReadonlySet<string>>> = {
  start: new Set(["fallback"]),
  menu: new Set(["timeout", "invalid"]),
};

export function isFallbackHandle(type: string, handle: string): boolean {
  return FALLBACK_HANDLES[type]?.has(handle) ?? false;
}

// Đường SVG (viewBox 0 0 24 24) của sáu loại bước — chép nguyên từ ICON của
// ivr-flow-themed.js:195-206, chỉ giữ sáu mục lô 7 dùng tới. Tra theo
// tokenSuffix (menu→dtmf, schedule→time).
const ICON: Readonly<Record<string, string>> = {
  start:
    "M16 2v6h6|m22 2-6 6|M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.1 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z",
  hangup:
    "M10.7 13.3a16 16 0 0 0 3.4 2.6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1|M5.3 12.6A19.8 19.8 0 0 1 2.1 4 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9|M2 2 22 22",
  play: "M11 5 6 9H2v6h4l5 4V5Z|M15.5 8.5a5 5 0 0 1 0 7",
  dtmf: "M4 9h16|M4 15h16|M10 3 8 21|M16 3l-2 18",
  time: "M12 6v6l4 2|M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  queue:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z|M22 21v-2a4 4 0 0 0-3-3.9",
};

export function iconPaths(type: string): string[] {
  const raw = ICON[tokenSuffix(type)];
  return raw === undefined ? [] : raw.split("|");
}

export function stepLabel(type: string): string {
  return STEP_TYPES.find((step) => step.type === type)?.label ?? type;
}

export function branchLabel(type: string, handle: string): string {
  if (handle.startsWith(CHOICE_PREFIX)) {
    return `Phím ${handle.slice(CHOICE_PREFIX.length)}`;
  }
  return BRANCH_LABELS[type]?.[handle] ?? handle;
}

// Danh mục trình dựng đã nạp (media, hàng đợi) — dùng để tra tên hiển thị
// trong tóm tắt node, thay vì hiện id thô (review vòng 3 lô 7 BLOCKING).
export interface StepCatalog {
  media: ReadonlyArray<{ id: string; name: string }>;
  queues: ReadonlyArray<{ queueRef: string; displayName: string }>;
}

export const EMPTY_CATALOG: StepCatalog = { media: [], queues: [] };

// Tóm tắt một dòng của node (AC-28: node-summary chữ --mono). Tên tra từ
// danh mục media/queue đã nạp; không thấy hoặc thiếu dữ liệu → "—".
export function summaryOf(
  node: {
    type: string;
    mediaId?: string;
    promptMediaId?: string;
    timeoutSeconds?: number;
    queueRef?: string;
    rules?: ReadonlyArray<unknown>;
  },
  catalog: StepCatalog,
): string {
  switch (node.type) {
    case "play": {
      const media = catalog.media.find((each) => each.id === node.mediaId);
      return media?.name ?? "—";
    }
    case "menu": {
      const media = catalog.media.find((each) => each.id === node.promptMediaId);
      if (media === undefined) {
        return "—";
      }
      return `${media.name} · chờ ${node.timeoutSeconds ?? "?"}s`;
    }
    case "queue": {
      const queue = catalog.queues.find((each) => each.queueRef === node.queueRef);
      return queue?.displayName ?? "—";
    }
    case "schedule": {
      const rules = node.rules ?? [];
      const rule = rules[0];
      // Tài liệu trên canvas có thể sai hình dạng (branchesOf, `flow/branches.ts:13-14`)
      // — kiểm rule và rule.time là object trước khi đọc, như Inspector.tsx:208-209/:236.
      if (
        typeof rule !== "object" ||
        rule === null ||
        typeof (rule as { time?: unknown }).time !== "object" ||
        (rule as { time: unknown }).time === null
      ) {
        return "—";
      }
      const time = (rule as { time: { from?: unknown; to?: unknown } }).time;
      const extra = rules.length > 1 ? ` (+${rules.length - 1})` : "";
      return `${time.from}–${time.to}${extra}`;
    }
    default:
      return "—";
  }
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
