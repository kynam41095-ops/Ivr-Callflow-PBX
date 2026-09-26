import type { FlowDocument } from "../flow/types";
import type { Did, FlowSummary, FlowVersionSummary } from "./api";

// Kho dữ liệu giả lập trong bộ nhớ. Mọi id là chuỗi uuid cố định gõ sẵn —
// e2e lô 3 đọc id kịch bản và danh mục từ đây, không sinh lúc nạp module.

export type MediaAsset = {
  id: string;
  name: string;
  status: "processing" | "ready" | "failed";
  sizeBytes: number;
  durationSeconds: number;
  createdAt: string;
};

export type QueueRecord = {
  queueRef: string;
  displayName: string;
};

export type StoredVersion = FlowVersionSummary & { document: FlowDocument };

const FLOW_MAIN = "5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d401";
// FLOW_KEYMAP: kịch bản kiểm bản đồ phím — lô 12 (AC-48, TC-CALL-026).
const FLOW_KEYMAP = "5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d402";
const VERSION_KEYMAP_DRAFT = "5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d413";
const VERSION_MAIN_ARCHIVED = "5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d411";
const VERSION_MAIN_PUBLISHED = "5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d412";
const DID_HOTLINE = "5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d421";
const DID_FRESH = "5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d422";
const MEDIA_WELCOME = "5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d431";
const MEDIA_MENU_PROMPT = "5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d432";
const MEDIA_SERVICE_INFO = "5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d433";
const MEDIA_AFTER_HOURS = "5c8ff6a1-4c0e-4a5b-9d2f-7a01b2c3d434";

export const mediaCatalog: MediaAsset[] = [
  {
    id: MEDIA_WELCOME,
    name: "Lời chào tổng đài",
    status: "ready",
    sizeBytes: 245760,
    durationSeconds: 12.5,
    createdAt: "2026-08-20T02:00:00Z",
  },
  {
    id: MEDIA_MENU_PROMPT,
    name: "Lời nhắc menu chính",
    status: "ready",
    sizeBytes: 307200,
    durationSeconds: 18,
    createdAt: "2026-08-21T02:00:00Z",
  },
  {
    id: MEDIA_SERVICE_INFO,
    name: "Giới thiệu dịch vụ",
    status: "ready",
    sizeBytes: 409600,
    durationSeconds: 25,
    createdAt: "2026-08-22T02:00:00Z",
  },
  {
    id: MEDIA_AFTER_HOURS,
    name: "Thông báo ngoài giờ",
    status: "ready",
    sizeBytes: 184320,
    durationSeconds: 9,
    createdAt: "2026-08-23T02:00:00Z",
  },
];

export const queueCatalog: QueueRecord[] = [
  { queueRef: "sales", displayName: "Hàng đợi bán hàng" },
  { queueRef: "support", displayName: "Hàng đợi hỗ trợ" },
];

// Bản archived: tài liệu nhỏ hơn nhưng vẫn hợp lệ, qua sạch hai lớp.
const ARCHIVED_DOCUMENT: FlowDocument = {
  schemaVersion: "1.1.0",
  startNodeId: "start",
  nodes: {
    start: {
      type: "start",
      label: "Bắt đầu",
      nextNodeId: "welcome",
      fallbackNodeId: "hangup",
    },
    welcome: {
      type: "play",
      label: "Lời chào tổng đài",
      mediaId: MEDIA_WELCOME,
      nextNodeId: "hangup",
    },
    hangup: { type: "hangup", label: "Kết thúc" },
  },
  canvas: {
    // Cách nhau 360px — 284px thẻ + 19px điểm nối nguồn (thẻ + handle ~303px)
    // chưa chồng lên node kế (lô 9, mục Rủi ro: 240px cũ làm thẻ chồng khi
    // chụp TC-FLOW-034).
    positions: {
      start: { x: 0, y: 0 },
      welcome: { x: 360, y: 0 },
      hangup: { x: 720, y: 0 },
    },
  },
};

// Bản published: đủ sáu loại node, đúng một node schedule với đúng 2 khung,
// đúng một node menu với đúng 2 phím, một node queue; mọi node tới được từ
// start. Liên kết bịa (Assumption 5): fallback của Bắt đầu và bấm sai của
// Menu trỏ node hangup.
const PUBLISHED_DOCUMENT: FlowDocument = {
  schemaVersion: "1.1.0",
  startNodeId: "start",
  nodes: {
    start: {
      type: "start",
      label: "Bắt đầu",
      nextNodeId: "schedule",
      fallbackNodeId: "hangup",
    },
    schedule: {
      type: "schedule",
      label: "Điều kiện theo lịch",
      timezone: "Asia/Ho_Chi_Minh",
      rules: [
        { time: { from: "08:00", to: "17:00" }, weekday: { from: 1, to: 5 } },
        { time: { from: "08:00", to: "12:00" }, weekday: { from: 6, to: 6 } },
      ],
      onOpenNodeId: "menu",
      onClosedNodeId: "play-closed",
    },
    menu: {
      type: "menu",
      label: "Menu phím bấm",
      promptMediaId: MEDIA_MENU_PROMPT,
      choices: { "1": "play-info", "2": "queue" },
      timeoutSeconds: 5,
      maxRetries: 1,
      onTimeoutNodeId: "hangup",
      onInvalidNodeId: "hangup",
    },
    "play-info": {
      type: "play",
      label: "Giới thiệu dịch vụ",
      mediaId: MEDIA_SERVICE_INFO,
      nextNodeId: "hangup",
    },
    "play-closed": {
      type: "play",
      label: "Thông báo ngoài giờ",
      mediaId: MEDIA_AFTER_HOURS,
      nextNodeId: "hangup",
    },
    queue: { type: "queue", label: "Chuyển hàng đợi", queueRef: "sales" },
    hangup: { type: "hangup", label: "Kết thúc" },
  },
  canvas: {
    // Cách nhau 360px ngang / 220px dọc — thẻ 284px + handle 19px không còn
    // chồng lên node kế (lô 9, mục Rủi ro).
    positions: {
      start: { x: 0, y: 220 },
      schedule: { x: 360, y: 220 },
      menu: { x: 720, y: 220 },
      "play-info": { x: 1080, y: 0 },
      queue: { x: 1080, y: 220 },
      "play-closed": { x: 1080, y: 440 },
      hangup: { x: 1440, y: 220 },
    },
  },
};

// Kịch bản kiểm bản đồ phím (lô 12): năm phím của keymap-menu trỏ năm loại
// đích khác nhau — queue (có label), play (không label), hangup (label toàn
// khoảng trắng), play (label 200 ký tự), hangup (sẽ bị xoá trong test để tái
// tạo "phím trỏ id không có"). Nhánh còn lại (fallback, timeout, invalid,
// nextNodeId của hai node play) trỏ keymap-blank — giữ tài liệu 0 lỗi lớp 1,
// lớp 2, 0 cảnh báo (lot-brief lô 12, Quy ước chung).
const KEYMAP_DOCUMENT: FlowDocument = {
  schemaVersion: "1.1.0",
  startNodeId: "keymap-start",
  nodes: {
    "keymap-start": {
      type: "start",
      label: "Bắt đầu",
      nextNodeId: "keymap-menu",
      fallbackNodeId: "keymap-blank",
    },
    "keymap-menu": {
      type: "menu",
      label: "Menu phím bấm",
      promptMediaId: MEDIA_MENU_PROMPT,
      choices: {
        "1": "keymap-cskh",
        "2": "keymap-nolabel",
        "3": "keymap-blank",
        "4": "keymap-long",
        "5": "keymap-gone",
      },
      timeoutSeconds: 5,
      onTimeoutNodeId: "keymap-blank",
      onInvalidNodeId: "keymap-blank",
    },
    "keymap-cskh": { type: "queue", label: "Chuyển hàng đợi CSKH", queueRef: "support" },
    "keymap-nolabel": { type: "play", mediaId: MEDIA_WELCOME, nextNodeId: "keymap-blank" },
    "keymap-blank": { type: "hangup", label: "   " },
    "keymap-long": {
      type: "play",
      label:
        "Giới thiệu dịch vụ chăm sóc khách hàng cao cấp dành riêng cho nhóm khách hàng doanh nghiệp lớn, bao gồm hỗ trợ kỹ thuật 24 7, tư vấn giải pháp chuyên sâu và ưu đãi đặc biệt theo hợp đồng dài hạn đã ky",
      mediaId: MEDIA_SERVICE_INFO,
      nextNodeId: "keymap-blank",
    },
    "keymap-gone": { type: "hangup", label: "Kết thúc" },
  },
  canvas: {
    positions: {
      "keymap-start": { x: 0, y: 440 },
      "keymap-menu": { x: 360, y: 440 },
      "keymap-cskh": { x: 720, y: 0 },
      "keymap-nolabel": { x: 720, y: 220 },
      "keymap-blank": { x: 720, y: 440 },
      "keymap-long": { x: 720, y: 660 },
      "keymap-gone": { x: 720, y: 880 },
    },
  },
};

export const flowStore: FlowSummary[] = [
  {
    id: FLOW_MAIN,
    name: "Kịch bản chăm sóc khách hàng",
    publishedVersionId: VERSION_MAIN_PUBLISHED,
    updatedAt: "2026-09-10T09:30:00Z",
  },
  {
    id: FLOW_KEYMAP,
    name: "Kịch bản kiểm bản đồ phím",
    publishedVersionId: null,
    updatedAt: "2026-09-20T03:00:00Z",
  },
];

export const versionStore: StoredVersion[] = [
  {
    id: VERSION_MAIN_ARCHIVED,
    flowId: FLOW_MAIN,
    versionNumber: 1,
    status: "archived",
    didId: null,
    createdAt: "2026-09-01T03:00:00Z",
    createdBy: "tran.thao@mitek.vn",
    name: "Bản khởi tạo",
    note: "Ba bước chào — lời chào rồi kết thúc, chưa có hàng đợi.",
    document: ARCHIVED_DOCUMENT,
  },
  {
    id: VERSION_MAIN_PUBLISHED,
    flowId: FLOW_MAIN,
    versionNumber: 2,
    status: "published",
    didId: DID_HOTLINE,
    createdAt: "2026-09-10T09:30:00Z",
    createdBy: "tran.thao@mitek.vn",
    name: "Đang triển khai chính",
    note: "Đủ sáu loại bước, đang chạy thật trên hotline 1900123456.",
    document: PUBLISHED_DOCUMENT,
  },
  {
    id: VERSION_KEYMAP_DRAFT,
    flowId: FLOW_KEYMAP,
    versionNumber: 1,
    status: "draft",
    didId: null,
    createdAt: "2026-09-20T03:00:00Z",
    createdBy: "tran.thao@mitek.vn",
    name: "Bản nháp",
    note: "Kịch bản kiểm bản đồ phím — lô 12.",
    document: KEYMAP_DOCUMENT,
  },
];

// Bộ ba nhất quán: did.publishedVersionId = version.id, version.flowId =
// flow.id, version.status = "published", version.didId = did.id,
// flow.publishedVersionId = version.id. Bản ghi đầu số không mang tài liệu
// hay tên kịch bản.
export const didStore: Did[] = [
  {
    id: DID_HOTLINE,
    number: "1900123456",
    publishedVersionId: VERSION_MAIN_PUBLISHED,
    provider: "Viettel",
    kind: "Hotline 1900",
  },
  {
    id: DID_FRESH,
    number: "0283456789",
    publishedVersionId: null,
    provider: "VNPT",
    kind: "Số cố định",
  },
];
