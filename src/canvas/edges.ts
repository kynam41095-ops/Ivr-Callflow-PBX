import { MarkerType, type Edge } from "@xyflow/react";
import { isFallbackHandle, tokenSuffix } from "./steps";

// Cạnh không phải thực thể của tài liệu (§3.3) — màu/nét chỉ tính lúc render,
// không ghi vào edges state hay data node (AC-9 đòi fromCanvas/toCanvas
// roundtrip không lẫn thứ này). Selected thắng CSS vì set trực tiếp inline.
// Nhận bảng id → loại thay vì nodes: BuilderScreen dựng bảng đó theo khoá
// chuỗi "id:type" nên styledEdges không đổi lại khi node kéo đổi vị trí
// (review vòng 3 lô 7 MINOR 3).
export function styledEdges(edges: Edge[], typeById: ReadonlyMap<string, string>): Edge[] {
  return edges.map((edge) => {
    const sourceType = typeById.get(edge.source) ?? "";
    const isFallback =
      typeof edge.sourceHandle === "string" && isFallbackHandle(sourceType, edge.sourceHandle);
    const baseColor = isFallback ? "var(--err-dot)" : `var(--n-${tokenSuffix(sourceType)}-b)`;
    const stroke = edge.selected ? "var(--acc)" : baseColor;
    return {
      ...edge,
      style: {
        stroke,
        strokeWidth: edge.selected ? 2.4 : 1.8,
        // Cạnh dự phòng giữ nét đứt kể cả khi được chọn — bản dựng thử
        // (IVR Builder v3.dc.html:1197) không tắt dasharray theo selected.
        ...(isFallback ? { strokeDasharray: "5 4" } : {}),
      },
      markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: 14, height: 14 },
    };
  });
}
