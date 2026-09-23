import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "../../styles/tokens.css";
import "./builder.css";
import {
  getVersion,
  listMedia,
  listQueues,
  listVersions,
  type FlowVersionSummary,
  type MediaAsset,
  type QueueRecord,
} from "../../data/api";
import { toCanvas } from "../../flow/canvas";
import { nodeTypes } from "../../canvas/FlowNode";
import { STEP_TYPES, newNodeData, type StepType } from "../../canvas/steps";
import { Inspector } from "./Inspector";

type Phase = "loading" | "ready" | "error";

function BuilderInner({ flowId }: { flowId: string }) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [queues, setQueues] = useState<QueueRecord[]>([]);
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const dragTypeRef = useRef<StepType | null>(null);
  const { screenToFlowPosition } = useReactFlow();

  // Tải phiên bản mới nhất qua ranh giới dữ liệu. Cờ huỷ trong cleanup —
  // StrictMode chạy effect hai lần. Lỗi thì hiện role="alert", không ném,
  // không để Promise reject trôi (lô 5 thêm nút thử lại).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [versions, mediaList, queueList] = await Promise.all([
          listVersions(flowId),
          listMedia(),
          listQueues(),
        ]);
        let latest: FlowVersionSummary | undefined;
        for (const version of versions) {
          if (latest === undefined || version.versionNumber > latest.versionNumber) {
            latest = version;
          }
        }
        if (latest === undefined) {
          throw new Error(`Kịch bản "${flowId}" chưa có phiên bản nào`);
        }
        const loaded = await getVersion(flowId, latest.id);
        if (cancelled) {
          return;
        }
        const canvas = toCanvas(loaded.document);
        setNodes(canvas.nodes);
        setEdges(canvas.edges);
        setMedia(mediaList);
        setQueues(queueList);
        setPhase("ready");
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : String(error));
          setPhase("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [flowId]);

  const onNodesChange = useCallback((changes: NodeChange<Node>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<Edge>[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
  }, []);

  // Mỗi điểm nối nguồn chỉ giữ một cạnh; id cạnh khớp toCanvas (lô 2) để
  // fromCanvas phủ đích lên data nhất quán.
  const onConnect = useCallback((connection: Connection) => {
    const { source, sourceHandle, target, targetHandle } = connection;
    if (source === null || sourceHandle === null || target === null) {
      return;
    }
    const edge: Edge = {
      id: `e-${source}-${sourceHandle}`,
      source,
      sourceHandle,
      target,
      targetHandle,
    };
    setEdges((current) => [
      ...current.filter(
        (each) => each.source !== source || each.sourceHandle !== sourceHandle,
      ),
      edge,
    ]);
  }, []);

  // dataTransfer.getData trong onDrop chập chờn giữa trình duyệt — đọc type
  // từ ref ghi ở onDragStart (rủi ro kéo thả, 3-plan-03).
  const onPaletteDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>, type: StepType) => {
      dragTypeRef.current = type;
      event.dataTransfer.setData("application/reactflow", type);
      event.dataTransfer.effectAllowed = "move";
    },
    [],
  );

  // dragend bắn trên phần tử nguồn cho cả thả lẫn huỷ (Escape, thả ngoài
  // canvas), và bắn SAU drop — nên đây là chỗ duy nhất đảm bảo ref không kẹt
  // sang phiên kéo sau (review iter 6, cổng 2 — Logic).
  const onPaletteDragEnd = useCallback(() => {
    dragTypeRef.current = null;
  }, []);

  const onDragOver = useCallback((event: DragEvent) => {
    // Không preventDefault thì drop không bắn.
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      // Chỉ nhận drop thuộc phiên kéo palette đang hoạt động — nội dung kéo từ
      // nơi khác (vd chữ đang chọn trong inspector) không mang nhãn này.
      if (!event.dataTransfer.types.includes("application/reactflow")) {
        return;
      }
      const type = dragTypeRef.current;
      dragTypeRef.current = null;
      if (type === null) {
        return;
      }
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      // Node mới thêm CUỐI mảng — fromCanvas lấy node start đầu mảng làm
      // startNodeId (Tự quyết iter 2).
      setNodes((current) => [
        ...current,
        { id: crypto.randomUUID(), type, position, data: newNodeData(type) },
      ]);
    },
    [screenToFlowPosition],
  );

  // Inspector thay NGUYÊN object data của node (không merge — xoá khoá phải
  // xoá thật, vd trục lịch vắng, maxRetries rỗng).
  const changeNodeData = useCallback((nodeId: string, data: Record<string, unknown>) => {
    setNodes((current) =>
      current.map((node) => (node.id === nodeId ? { ...node, data } : node)),
    );
  }, []);

  const removeBranchEdges = useCallback((nodeId: string, sourceHandle: string) => {
    setEdges((current) =>
      current.filter((edge) => !(edge.source === nodeId && edge.sourceHandle === sourceHandle)),
    );
  }, []);

  const selectedNode = nodes.find((node) => node.selected);

  return (
    <div className="builder">
      <div className="builder-palette" data-testid="palette">
        {STEP_TYPES.map(({ type, label }) => (
          <div
            key={type}
            className="builder-palette-item"
            draggable
            data-testid="palette-item"
            data-node-type={type}
            onDragStart={(event) => onPaletteDragStart(event, type)}
            onDragEnd={onPaletteDragEnd}
          >
            {label}
          </div>
        ))}
      </div>
      <div className="builder-canvas">
        {phase === "loading" ? (
          <p className="builder-loading">Đang tải…</p>
        ) : phase === "error" ? (
          <div role="alert" className="builder-error">
            {errorMessage}
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            fitView
          />
        )}
      </div>
      {phase === "ready" && selectedNode !== undefined ? (
        <Inspector
          node={selectedNode}
          media={media}
          queues={queues}
          onDataChange={(data) => changeNodeData(selectedNode.id, data)}
          onBranchRemoved={(handle) => removeBranchEdges(selectedNode.id, handle)}
        />
      ) : null}
    </div>
  );
}

export default function BuilderScreen({ flowId }: { flowId: string }) {
  return (
    <ReactFlowProvider>
      <BuilderInner flowId={flowId} />
    </ReactFlowProvider>
  );
}
