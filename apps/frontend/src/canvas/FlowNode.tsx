import { createContext, useContext, useEffect, useMemo, type CSSProperties } from "react";
import {
  Handle,
  Position,
  useStore,
  useUpdateNodeInternals,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import { branchesOf } from "../flow/branches";
import type { FlowNode as FlowNodeModel } from "../flow/types";
import type { NodeIssue } from "./issues";
import {
  FALLBACK_HANDLES,
  branchLabel,
  EMPTY_CATALOG,
  iconPaths,
  stepLabel,
  summaryOf,
  tokenSuffix,
  type StepCatalog,
} from "./steps";

// Dấu kiểm hợp lệ đưa vào node qua context, KHÔNG qua node.data — fromCanvas
// chép nguyên data vào tài liệu, khoá lạ làm lớp 1 báo additionalProperties
// (3-plan-04 Cross-module). Map để id `__proto__` không đổi prototype.
export const NodeIssuesContext = createContext<ReadonlyMap<string, NodeIssue[]>>(new Map());

// Danh mục media/hàng đợi đã nạp — đặt cạnh NodeIssuesContext (lot-brief lô
// 7), để summaryOf tra tên hiển thị thay vì id thô.
export const CatalogContext = createContext<StepCatalog>(EMPTY_CATALOG);

const EMPTY_SET: ReadonlySet<string> = new Set();

// Một component duy nhất cho cả sáu loại bước: tiêu đề và điểm nối nguồn
// sinh từ data của node qua branchesOf — không gõ tay tên điểm nối. queue và
// hangup không có nhánh ra → 0 điểm nối nguồn (TC-CALL-016).
function FlowNodeView({ id, data, selected }: NodeProps) {
  const issues = useContext(NodeIssuesContext).get(id) ?? [];
  const catalog = useContext(CatalogContext);
  const type = typeof data.type === "string" ? data.type : "";
  const title =
    typeof data.label === "string" && data.label !== "" ? data.label : stepLabel(type);
  const branches = branchesOf(data as FlowNodeModel);
  const updateNodeInternals = useUpdateNodeInternals();
  // Số điểm nối của Menu đổi theo số phím — báo React Flow đo lại để cạnh
  // bám đúng điểm nối. Chỉ dùng cơ chế gốc của thư viện, không tự đo (AC-2).
  const handleKey = branches.map((branch) => branch.handle).join(",");

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, handleKey, updateNodeInternals]);

  // Nối hay chưa đọc từ cạnh thật trong store thư viện, KHÔNG từ data —
  // onConnect/xoá cạnh của BuilderScreen không ghi lại vào data (lot-brief lô
  // 7 "node-branch[data-state]"). useStore + chuỗi handle (so bằng giá trị,
  // không phải useEdges() so mảng theo tham chiếu) — đổi cạnh của node khác
  // không làm thẻ này render lại (review vòng 3 lô 7 MINOR).
  // Handle đích cũng đổi trạng thái khi có cạnh vào (review vòng 3 lô 7
  // MINOR 1, ivr-flow-themed.js:224-225) — thêm cờ hasIncoming vào cùng
  // chuỗi khoá để chỉ một selector, vẫn so bằng giá trị.
  const connectionState = useStore((state) => {
    let handleKey = "";
    let hasIncoming = false;
    for (const edge of state.edges) {
      if (edge.source === id && typeof edge.sourceHandle === "string") {
        handleKey += edge.sourceHandle + ",";
      }
      if (edge.target === id) {
        hasIncoming = true;
      }
    }
    return handleKey + "|" + (hasIncoming ? "1" : "0");
  });
  const [handleKeyPart, hasIncomingPart] = connectionState.split("|");
  const hasIncoming = hasIncomingPart === "1";
  const connectedHandles = useMemo(
    () => new Set(handleKeyPart === "" ? [] : handleKeyPart.split(",").slice(0, -1)),
    [handleKeyPart],
  );

  const fallbackHandles = FALLBACK_HANDLES[type] ?? EMPTY_SET;
  const unlinkedCount = branches.filter((branch) => !connectedHandles.has(branch.handle)).length;

  const cardStyle = { "--k-stroke": `var(--n-${tokenSuffix(type)}-b)` } as CSSProperties;
  const cardClass =
    "node-card" + (selected ? " is-selected" : unlinkedCount > 0 ? " is-warn" : "");

  return (
    <>
      {type !== "start" ? (
        <Handle
          type="target"
          position={Position.Left}
          className={"node-handle node-handle-target" + (hasIncoming ? " on" : "")}
          style={cardStyle}
        />
      ) : null}
      <div className={cardClass} data-testid="node-card" style={cardStyle}>
        <div className="node-bar" data-testid="node-bar" />
        <div className="node-top">
          <div className="node-icon" data-testid="node-icon">
            <svg
              width={15}
              height={15}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {iconPaths(type).map((d, index) => (
                <path key={index} d={d} />
              ))}
            </svg>
          </div>
          <div className="node-title" data-testid="node-title">
            {title}
          </div>
        </div>
        <div className="node-summary" data-testid="node-summary">
          {summaryOf(data as FlowNodeModel, catalog)}
        </div>
        {branches.length > 0 ? (
          <div className="node-branches">
            {branches.map((branch) => {
              const connected = connectedHandles.has(branch.handle);
              const state = fallbackHandles.has(branch.handle)
                ? "fallback"
                : connected
                  ? "linked"
                  : "open";
              return (
                <div
                  key={branch.handle}
                  className="node-branch"
                  data-testid="node-branch"
                  data-handleid={branch.handle}
                  data-state={state}
                >
                  <span className="handle-label" data-testid="handle-label" data-handleid={branch.handle}>
                    {branchLabel(type, branch.handle)}
                  </span>
                  <span className="node-dot" data-testid="node-dot" />
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={branch.handle}
                    className={"node-handle node-handle-source" + (connected ? " on" : "")}
                  />
                </div>
              );
            })}
          </div>
        ) : null}
        {issues.map((issue, index) => (
          <div
            key={index}
            className="builder-node-issue"
            data-testid="node-issue"
            data-severity={issue.severity}
            data-code={issue.code}
            title={issue.message}
          >
            {issue.message}
          </div>
        ))}
        {unlinkedCount > 0 ? (
          <div className="node-foot" data-testid="node-foot">
            {unlinkedCount} nhánh chưa nối
          </div>
        ) : null}
      </div>
    </>
  );
}

// Khai ở cấp module — tạo trong component là React Flow cảnh báo error002.
export const nodeTypes = {
  start: FlowNodeView,
  play: FlowNodeView,
  menu: FlowNodeView,
  queue: FlowNodeView,
  hangup: FlowNodeView,
  schedule: FlowNodeView,
} satisfies NodeTypes;
