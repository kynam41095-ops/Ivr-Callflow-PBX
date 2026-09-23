import { createContext, useContext, useEffect } from "react";
import {
  Handle,
  Position,
  useUpdateNodeInternals,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import { branchesOf } from "../flow/branches";
import type { FlowNode as FlowNodeModel } from "../flow/types";
import type { NodeIssue } from "./issues";
import { branchLabel, stepLabel } from "./steps";

// Dấu kiểm hợp lệ đưa vào node qua context, KHÔNG qua node.data — fromCanvas
// chép nguyên data vào tài liệu, khoá lạ làm lớp 1 báo additionalProperties
// (3-plan-04 Cross-module). Map để id `__proto__` không đổi prototype.
export const NodeIssuesContext = createContext<ReadonlyMap<string, NodeIssue[]>>(new Map());

// Một component duy nhất cho cả sáu loại bước: tiêu đề và điểm nối nguồn
// sinh từ data của node qua branchesOf — không gõ tay tên điểm nối. queue và
// hangup không có nhánh ra → 0 điểm nối nguồn (TC-CALL-016).
function FlowNodeView({ id, data }: NodeProps) {
  const issues = useContext(NodeIssuesContext).get(id) ?? [];
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

  return (
    <div className="builder-node">
      {type !== "start" ? <Handle type="target" position={Position.Left} /> : null}
      <div className="builder-node-title">{title}</div>
      {branches.map((branch) => (
        <div className="builder-node-branch" key={branch.handle}>
          <Handle type="source" position={Position.Right} id={branch.handle} />
          <span data-testid="handle-label" data-handleid={branch.handle}>
            {branchLabel(type, branch.handle)}
          </span>
        </div>
      ))}
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
    </div>
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
