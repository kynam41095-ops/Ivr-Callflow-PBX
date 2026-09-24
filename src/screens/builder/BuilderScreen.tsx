import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
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
  createFlow,
  getVersion,
  listMedia,
  listQueues,
  listVersions,
  saveDraft,
  type FlowVersionSummary,
  type MediaAsset,
  type QueueRecord,
} from "../../data/api";
import { fromCanvas, toCanvas } from "../../flow/canvas";
import { NodeIssuesContext, nodeTypes } from "../../canvas/FlowNode";
import { collectIssues, type NodeIssue, type ValidationView } from "../../canvas/issues";
import {
  NEW_FLOW_NAME,
  STEP_TYPES,
  newFlowDocument,
  newNodeData,
  type StepType,
} from "../../canvas/steps";
import { ErrorState } from "../../ui/ErrorState";
import { VersionsDrawer } from "../versions/VersionsDrawer";
import { Inspector } from "./Inspector";

type Phase = "loading" | "ready" | "error";

// Trạng thái ô lưu nháp. saved mang số phiên bản; error mang thông điệp đọc được.
type SaveState =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "saved"; versionNumber: number }
  | { state: "error"; message: string };

function BuilderInner({ flowId }: { flowId: string }) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [queues, setQueues] = useState<QueueRecord[]>([]);
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [save, setSave] = useState<SaveState>({ state: "idle" });
  // restoring/restoreError: trạng thái khôi phục phiên bản, đặt ở trình dựng
  // (không phải drawer) — drawer có thể bị đóng giữa chừng nhưng khoá busyRef
  // và trạng thái "đang bận" vẫn phải giữ để truyền sang nút Lưu nháp (review
  // iter 10 BLOCKING).
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState("");
  const [validation, setValidation] = useState<ValidationView | null>(null);
  const [creating, setCreating] = useState(false);
  const [newFlowError, setNewFlowError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [versionsOpen, setVersionsOpen] = useState(false);
  // versionsKey tăng mỗi lần lưu nháp thành công → drawer đang mở tự nạp lại
  // danh sách phiên bản (3-plan-05).
  const [versionsKey, setVersionsKey] = useState(0);
  const dragTypeRef = useRef<StepType | null>(null);
  // aliveRef chặn setState sau khi unmount (StrictMode + rời màn giữa chừng).
  // busyRef là khoá ghi DÙNG CHUNG cho lưu nháp và khôi phục phiên bản — hai
  // thao tác không được chạy chồng nhau (review iter 10 BLOCKING). creatingRef
  // chặn tạo kịch bản mới, để riêng. Mọi ref đặt ĐỒNG BỘ trước lần render kịp
  // disable nút.
  const aliveRef = useRef(false);
  const busyRef = useRef(false);
  const creatingRef = useRef(false);
  const { screenToFlowPosition } = useReactFlow();

  // Tải phiên bản mới nhất qua ranh giới dữ liệu. Cờ huỷ trong cleanup —
  // StrictMode chạy effect hai lần. Lỗi thì hiện role="alert" kèm nút thử lại,
  // không ném, không để Promise reject trôi. reloadToken tăng khi bấm thử lại
  // hoặc khôi phục phiên bản — nạp lại, bỏ sửa đổi chưa lưu (Tự quyết iter 9).
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
  }, [flowId, reloadToken]);

  // Cờ sống: true trong thân effect, false trong cleanup. StrictMode chạy
  // mount/cleanup/mount nên kết thúc vẫn true; unmount thật thì về false.
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Nạp lại toàn bộ màn (nút thử lại, khôi phục phiên bản xong). Không đụng
  // cờ cancelled của effect tải — token đổi thì cleanup của effect tự chạy.
  const reload = useCallback(() => {
    setPhase("loading");
    setErrorMessage("");
    setValidation(null);
    setSave({ state: "idle" });
    setReloadToken((token) => token + 1);
  }, []);

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

  // Lưu nháp: chụp tài liệu ĐỒNG BỘ trước await (bản chụp lúc bấm), busyRef
  // chặn lưu hai lần và chặn chạy chồng với khôi phục. Không ném, không để
  // Promise reject trôi thành pageerror.
  const handleSave = useCallback(() => {
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    setSave({ state: "saving" });
    const doc = fromCanvas(nodes, edges);
    (async () => {
      try {
        const saved = await saveDraft(flowId, doc);
        if (aliveRef.current) {
          setSave({ state: "saved", versionNumber: saved.versionNumber });
          setVersionsKey((key) => key + 1);
        }
      } catch (error) {
        if (aliveRef.current) {
          setSave({
            state: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      } finally {
        busyRef.current = false;
      }
    })();
  }, [nodes, edges, flowId]);

  // Khôi phục phiên bản: getVersion → saveDraft(…, restoredFromVersionId) tạo
  // bản nháp mới, rồi reload nạp lại canvas bằng bản đó (bỏ sửa đổi chưa lưu).
  // Dùng CHUNG busyRef với lưu nháp — hai thao tác không chạy đồng thời, nút
  // Lưu nháp cũng khoá trong lúc khôi phục (review iter 10 BLOCKING). Đặt ở
  // trình dựng thay vì drawer: drawer có thể bị đóng giữa chừng nhưng khoá và
  // trạng thái "đang bận" vẫn giữ, khôi phục vẫn chạy tới nơi tới chốn. Thành
  // công thì tăng versionsKey để drawer đang mở nạp lại danh sách; catch chỉ
  // phủ getVersion/saveDraft — đọc lại danh sách đi qua effect riêng của drawer
  // nên đọc lỗi thì hiện retry, không tạo nháp trùng (review iter 9 BLOCKING).
  const handleRestore = useCallback(
    (versionId: string) => {
      if (busyRef.current) {
        return;
      }
      busyRef.current = true;
      setRestoring(true);
      setRestoreError("");
      (async () => {
        try {
          const { document } = await getVersion(flowId, versionId);
          await saveDraft(flowId, document, versionId);
          if (aliveRef.current) {
            setVersionsKey((key) => key + 1);
            reload();
          }
        } catch (error) {
          if (aliveRef.current) {
            setRestoreError(
              `Không khôi phục được: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        } finally {
          busyRef.current = false;
          if (aliveRef.current) {
            setRestoring(false);
          }
        }
      })();
    },
    [flowId, reload],
  );

  // Kiểm hợp lệ: đồng bộ, thay NGUYÊN kết quả để bấm hai lần không nhân đôi
  // dấu. Dấu giữ tới lần bấm kế tiếp, không tự xoá khi sửa canvas (Tự quyết 8).
  const handleValidate = useCallback(() => {
    setValidation(collectIssues(fromCanvas(nodes, edges)));
  }, [nodes, edges]);

  // Kịch bản mới: createFlow rồi saveDraft bản nháp trống, đổi hash (id thô) để
  // App dựng BuilderScreen mới qua key. Lỗi → new-flow-error, không điều hướng.
  const handleNewFlow = useCallback(() => {
    if (creatingRef.current) {
      return;
    }
    creatingRef.current = true;
    setCreating(true);
    setNewFlowError("");
    (async () => {
      try {
        const flow = await createFlow(NEW_FLOW_NAME);
        await saveDraft(flow.id, newFlowDocument());
        if (aliveRef.current) {
          window.location.hash = `#/flows/${flow.id}`;
        }
      } catch (error) {
        if (aliveRef.current) {
          setNewFlowError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        creatingRef.current = false;
        if (aliveRef.current) {
          setCreating(false);
        }
      }
    })();
  }, []);

  // Dấu gắn node đưa vào FlowNode qua context (Map), KHÔNG qua node.data —
  // fromCanvas chép nguyên data vào tài liệu, khoá lạ làm lớp 1 báo
  // additionalProperties. Issue không nodeId hiện trong validate-result.
  const issuesByNode = useMemo(() => {
    const map = new Map<string, NodeIssue[]>();
    if (validation !== null) {
      for (const issue of validation.issues) {
        if (issue.nodeId === undefined) {
          continue;
        }
        const list = map.get(issue.nodeId);
        if (list === undefined) {
          map.set(issue.nodeId, [issue]);
        } else {
          list.push(issue);
        }
      }
    }
    return map;
  }, [validation]);

  const looseIssues =
    validation === null ? [] : validation.issues.filter((issue) => issue.nodeId === undefined);
  const errorCount =
    validation === null
      ? 0
      : validation.issues.filter((issue) => issue.severity === "error").length;
  const warningCount =
    validation === null
      ? 0
      : validation.issues.filter((issue) => issue.severity === "warning").length;

  const selectedNode = nodes.find((node) => node.selected);

  // Mở drawer: xoá lỗi khôi phục cũ để lần mở sau không hiện lại thông báo
  // của lần trước (plan.md Tự quyết iter 9).
  const openVersions = useCallback(() => {
    setRestoreError("");
    setVersionsOpen(true);
  }, []);
  const closeVersions = useCallback(() => setVersionsOpen(false), []);

  return (
    <div className="builder">
      <div className="builder-toolbar" data-testid="builder-toolbar">
        <button type="button" data-testid="new-flow" onClick={handleNewFlow} disabled={creating}>
          Kịch bản mới
        </button>
        <button
          type="button"
          data-testid="save-draft"
          onClick={handleSave}
          disabled={phase !== "ready" || save.state === "saving" || restoring}
        >
          Lưu nháp
        </button>
        <button
          type="button"
          data-testid="validate"
          onClick={handleValidate}
          disabled={phase !== "ready"}
        >
          Kiểm tra hợp lệ
        </button>
        {/* Bấm được ở MỌI phase (kể cả error) — chỉ mở, không đảo trạng thái
            (3-plan-05). */}
        <button type="button" data-testid="versions-open" onClick={openVersions}>
          Phiên bản
        </button>
        <span
          className="builder-save-status"
          data-testid="save-status"
          data-state={save.state}
          data-version-number={save.state === "saved" ? save.versionNumber : undefined}
          role={save.state === "error" ? "alert" : undefined}
        >
          {save.state === "saving"
            ? "Đang lưu…"
            : save.state === "saved"
              ? `Đã lưu bản nháp v${save.versionNumber}`
              : save.state === "error"
                ? `Không lưu được: ${save.message}`
                : ""}
        </span>
        {validation !== null ? (
          <div
            className="builder-validate-result"
            data-testid="validate-result"
            data-valid={validation.valid ? "true" : "false"}
          >
            <span className="builder-validate-summary">
              {validation.valid ? "Kịch bản hợp lệ" : `Kịch bản có ${errorCount} lỗi`}
              {warningCount > 0 ? `, ${warningCount} cảnh báo` : ""}
            </span>
            {looseIssues.map((issue, index) => (
              <span
                key={index}
                className="builder-validate-issue"
                data-testid="validate-issue"
                data-code={issue.code}
                data-severity={issue.severity}
              >
                {issue.message}
              </span>
            ))}
          </div>
        ) : null}
        {newFlowError !== "" ? (
          <span className="builder-new-flow-error" data-testid="new-flow-error" role="alert">
            {newFlowError}
          </span>
        ) : null}
      </div>
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
          <ErrorState message={`Không tải được kịch bản: ${errorMessage}`} onRetry={reload} />
        ) : (
          <NodeIssuesContext.Provider value={issuesByNode}>
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
          </NodeIssuesContext.Provider>
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
      {/* Drawer position: fixed — không tham gia grid của .builder, phủ lên
          cột inspector. Khôi phục giờ do trình dựng đảm nhiệm (handleRestore) —
          drawer chỉ hiển thị danh sách và chuyển tiếp lệnh; busy khoá cả nút
          khôi phục lẫn nút Lưu nháp trong lúc một thao tác ghi đang chạy, nên
          đóng drawer giữa chừng không làm mất khoá (review iter 10 BLOCKING). */}
      {versionsOpen ? (
        <VersionsDrawer
          flowId={flowId}
          reloadKey={versionsKey}
          busy={restoring || save.state === "saving"}
          restoreError={restoreError}
          onClose={closeVersions}
          onRestore={handleRestore}
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
