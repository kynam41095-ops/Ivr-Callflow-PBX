import type { FlowDocument } from "../flow/types";
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
