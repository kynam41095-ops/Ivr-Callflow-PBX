import type { FlowDocument } from "../flow/types";
import { checkShape } from "../flow/validate";
import {
  didStore,
  flowStore,
  mediaCatalog,
  queueCatalog,
  versionStore,
  type MediaAsset,
  type QueueRecord,
  type StoredVersion,
} from "./mock";

export type { MediaAsset, QueueRecord };

// Ranh giới truy cập dữ liệu duy nhất của giao diện. Tên và hình dạng bám
// builder-api.yaml (Did, FlowSummary, FlowVersionSummary,
// GET /flows/{flowId}/versions/{versionId}). Đợt này đứng sau là kho giả lập
// trong bộ nhớ; đợt 1 thay bằng HTTP thật không đổi chữ ký.
// Mọi hàm async và trả bản sao — màn hình không sửa được kho.

export type Did = {
  id: string;
  number: string;
  publishedVersionId: string | null;
};

export type FlowSummary = {
  id: string;
  name: string;
  publishedVersionId: string | null;
  updatedAt: string;
};

export type FlowVersionStatus = "draft" | "published" | "archived";

export type FlowVersionSummary = {
  id: string;
  flowId: string;
  versionNumber: number;
  status: FlowVersionStatus;
  didId: string | null;
  createdAt: string;
  createdBy: string;
};

function toSummary(stored: StoredVersion): FlowVersionSummary {
  return {
    id: stored.id,
    flowId: stored.flowId,
    versionNumber: stored.versionNumber,
    status: stored.status,
    didId: stored.didId,
    createdAt: stored.createdAt,
    createdBy: stored.createdBy,
  };
}

export async function listPhoneNumbers(): Promise<Did[]> {
  return structuredClone(didStore);
}

export async function listFlows(): Promise<FlowSummary[]> {
  return structuredClone(flowStore);
}

export async function listVersions(flowId: string): Promise<FlowVersionSummary[]> {
  const flowExists = flowStore.some((flow) => flow.id === flowId);
  if (!flowExists) {
    throw new Error(`Không tìm thấy kịch bản với id "${flowId}"`);
  }
  return structuredClone(
    versionStore
      .filter((stored) => stored.flowId === flowId)
      .sort((a, b) => a.versionNumber - b.versionNumber)
      .map(toSummary),
  );
}

export async function getVersion(
  flowId: string,
  versionId: string,
): Promise<{ version: FlowVersionSummary; document: FlowDocument }> {
  const stored = versionStore.find((v) => v.id === versionId && v.flowId === flowId);
  if (!stored) {
    throw new Error(
      `Không tìm thấy phiên bản "${versionId}" của kịch bản "${flowId}"`,
    );
  }
  return structuredClone({ version: toSummary(stored), document: stored.document });
}

// Danh mục file âm thanh (GET /media) — trả mảng, bỏ quota vì không màn nào
// dùng (Out of Scope "Màn hình file âm thanh").
export async function listMedia(): Promise<MediaAsset[]> {
  return structuredClone(mediaCatalog);
}

// Danh sách hàng đợi của tenant (GET /resources/queues, items[]).
export async function listQueues(): Promise<QueueRecord[]> {
  return structuredClone(queueCatalog);
}

// Trễ giả lập để trạng thái "đang lưu" quan sát được trên giao diện
// (TC-FLOW-020). Đợt 1 thay bằng độ trễ mạng thật.
const SAVE_DELAY_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// POST /flows/{flowId}/versions — lưu một bản nháp mới. Thứ tự bắt buộc theo
// 3-plan-04: chụp tài liệu đồng bộ trước await, trễ, kiểm tra, tính số phiên
// bản ngay trước push (hai lần gọi song song cho hai số khác nhau).
export async function saveDraft(
  flowId: string,
  document: FlowDocument,
  restoredFromVersionId?: string,
): Promise<FlowVersionSummary> {
  // Bản chụp đồng bộ TRƯỚC await đầu tiên — người gọi sửa object sau đó không
  // rò vào kho (rủi ro "Bản chụp", 3-plan-04).
  const snapshot = structuredClone(document);

  await delay(SAVE_DELAY_MS);

  const flow = flowStore.find((each) => each.id === flowId);
  if (flow === undefined) {
    throw new Error(`Không tìm thấy kịch bản với id "${flowId}"`);
  }

  if (restoredFromVersionId !== undefined) {
    const restored = versionStore.find(
      (each) => each.id === restoredFromVersionId && each.flowId === flowId,
    );
    if (restored === undefined) {
      throw new Error(
        `Không tìm thấy phiên bản "${restoredFromVersionId}" của kịch bản "${flowId}"`,
      );
    }
  }

  // Chỉ chặn lớp 1 (ứng 422 ValidationFailed). Lớp 2 đỏ và cảnh báo schedule
  // vẫn lưu được — plan.md Tự quyết iter 8.
  if (!checkShape(snapshot).ok) {
    throw new Error(
      "Bản nháp chưa đúng định dạng tài liệu kịch bản — bấm Kiểm tra hợp lệ để xem bước nào sai.",
    );
  }

  // versionNumber tính SAU trễ, ngay trước push; không await giữa tính và push
  // nên hai lời gọi song song nhận hai số liên tiếp.
  const versionNumber =
    versionStore.reduce(
      (max, each) =>
        each.flowId === flowId && each.versionNumber > max ? each.versionNumber : max,
      0,
    ) + 1;

  const createdAt = new Date().toISOString();
  const stored: StoredVersion = {
    id: crypto.randomUUID(),
    flowId,
    versionNumber,
    status: "draft",
    didId: null,
    createdAt,
    createdBy: "tran.thao@mitek.vn",
    document: snapshot,
  };
  versionStore.push(stored);
  // Chỉ cập nhật updatedAt của kịch bản; không đụng publishedVersionId, didStore
  // hay phiên bản khác (AC-24 lô 5 dựa vào đây).
  flow.updatedAt = createdAt;

  return structuredClone(toSummary(stored));
}

// POST /flows — tạo kịch bản mới, KHÔNG tạo phiên bản (trả FlowSummary).
export async function createFlow(name: string): Promise<FlowSummary> {
  const trimmed = name.trim();
  if (trimmed === "" || name.length > 200) {
    throw new Error("Tên kịch bản phải có từ 1 đến 200 ký tự");
  }
  const flow: FlowSummary = {
    id: crypto.randomUUID(),
    name: trimmed,
    publishedVersionId: null,
    updatedAt: new Date().toISOString(),
  };
  flowStore.push(flow);
  return structuredClone(flow);
}
