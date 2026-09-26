import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
} from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
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
import "./builder.css";
import {
  createFlow,
  getVersion,
  listFlows,
  listMedia,
  listPhoneNumbers,
  listQueues,
  listVersions,
  saveDraft,
  type Did,
  type FlowSummary,
  type FlowVersionSummary,
  type MediaAsset,
  type QueueRecord,
} from "../../data/api";
import type { FlowDocument } from "../../flow/types";
import { fromCanvas, toCanvas } from "../../flow/canvas";
import { CatalogContext, NodeIssuesContext, nodeTypes } from "../../canvas/FlowNode";
import { styledEdges } from "../../canvas/edges";
import { collectIssues, type ValidationView, type NodeIssue } from "../../canvas/issues";
import {
  NEW_FLOW_NAME,
  PALETTE_GROUPS,
  newFlowDocument,
  newNodeData,
  stepCode,
  stepLabel,
  tokenSuffix,
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

// So sánh cấu trúc hai giá trị JSON — dùng cho dirty-status (fromCanvas hiện
// tại so tài liệu đã tải/lưu gần nhất). Không dùng JSON.stringify vì thứ tự
// khoá object có thể khác giữa hai lần dù cùng nội dung (Object.fromEntries
// giữ thứ tự chèn của canvas.ts).
function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, index) => jsonEqual(value, b[index]))
    );
  }
  if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    return (
      aKeys.length === bKeys.length &&
      aKeys.every(
        (key) =>
          Object.hasOwn(b, key) &&
          jsonEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
      )
    );
  }
  return false;
}

// Nhãn/màu trạng thái phiên bản dùng chung cho version-select và
// version-status của builder-toolbar (lô 9, Quy ước chung).
const VERSION_SELECT_WORD: Record<FlowVersionSummary["status"], string> = {
  published: "đang chạy",
  draft: "nháp",
  archived: "lưu trữ",
};
const VERSION_STATUS_INFO: Record<
  FlowVersionSummary["status"],
  { label: string; bg: string; color: string; dot: string }
> = {
  published: { label: "Đang chạy thật", bg: "var(--ok-soft)", color: "var(--ok)", dot: "var(--ok-dot)" },
  draft: { label: "Bản nháp", bg: "var(--warn-soft)", color: "var(--warn)", dot: "var(--warn-dot)" },
  archived: { label: "Lưu trữ", bg: "var(--bg-muted)", color: "var(--fg-2)", dot: "var(--fg-3)" },
};

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
  // versions/openVersionId/flow/did: dữ liệu cho builder-toolbar (lô 9) —
  // version-select, version-status, versions-open, builder-number,
  // builder-flow-name. versions cập nhật tại chỗ khi lưu nháp (không nạp lại
  // canvas — Quy ước chung lô 9 "lưu xong = bản vừa lưu").
  const [versions, setVersions] = useState<FlowVersionSummary[]>([]);
  const [openVersionId, setOpenVersionId] = useState<string | null>(null);
  const [flow, setFlow] = useState<FlowSummary | undefined>(undefined);
  const [did, setDid] = useState<Did | undefined>(undefined);
  const dragTypeRef = useRef<StepType | null>(null);
  // aliveRef chặn setState sau khi unmount (StrictMode + rời màn giữa chừng).
  // busyRef là khoá ghi DÙNG CHUNG cho lưu nháp và khôi phục phiên bản — hai
  // thao tác không được chạy chồng nhau (review iter 10 BLOCKING). creatingRef
  // chặn tạo kịch bản mới, để riêng. Mọi ref đặt ĐỒNG BỘ trước lần render kịp
  // disable nút.
  const aliveRef = useRef(false);
  const busyRef = useRef(false);
  const creatingRef = useRef(false);
  // targetVersionRef: id phiên bản cần nạp ở lần chạy tiếp theo của effect
  // tải chính — null nghĩa là "mới nhất". reload() (thử lại, khôi phục) đặt
  // ref này trước khi tăng reloadToken, effect tải vẫn chỉ phụ thuộc
  // [flowId, reloadToken] (lô 9, Quy ước chung "Id cần nạp giữ trong ref").
  const targetVersionRef = useRef<string | null>(null);
  // loadedDoc: tài liệu lúc tải/lưu/chọn phiên bản gần nhất — PHẢI là state
  // (không phải ref): isDirty là useMemo đọc giá trị này, một ref đổi không
  // làm memo tính lại vì deps không đổi (review BLOCKING "dirty-status giữ
  // 'chưa lưu' sau khi lưu nháp xong"). Chuẩn hoá qua fromCanvas(toCanvas(...))
  // ở tải/chọn bản để so cùng hình dạng với fromCanvas(nodes, edges) — tài
  // liệu thô có thể thiếu canvas.viewport hay toạ độ node (review MINOR).
  const [loadedDoc, setLoadedDoc] = useState<FlowDocument | null>(null);
  // pickingVersion: cờ STATE (không chỉ busyRef) để khoá version-select/
  // save-draft trong lúc đang đọc bản đã chọn — ref không kích hoạt render
  // (review BLOCKING "Chọn phiên bản trong lúc đang lưu…").
  const [pickingVersion, setPickingVersion] = useState(false);
  const [pickError, setPickError] = useState("");
  // Palette thu gọn/mở rộng — MỖI lần dựng BuilderScreen bắt đầu thu gọn (Quy
  // ước chung lô 10). tip là nhãn của mục đang được rê chuột lúc thu gọn; toạ
  // độ lấy từ bounding rect của mục: left = cạnh phải + 9, top = tâm dọc (bản
  // dựng thử dòng 1700-1702).
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [tip, setTip] = useState<{ label: string; x: number; y: number } | null>(null);
  const { screenToFlowPosition } = useReactFlow();

  // Tải phiên bản (mới nhất, hoặc bản trong targetVersionRef) qua ranh giới
  // dữ liệu. Cờ huỷ trong cleanup — StrictMode chạy effect hai lần. Lỗi thì
  // hiện role="alert" kèm nút thử lại, không ném, không để Promise reject
  // trôi. reloadToken tăng khi bấm thử lại hoặc khôi phục phiên bản.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [versionList, mediaList, queueList, dids, flows] = await Promise.all([
          listVersions(flowId),
          listMedia(),
          listQueues(),
          listPhoneNumbers(),
          listFlows(),
        ]);
        let target = versionList.find((version) => version.id === targetVersionRef.current);
        if (target === undefined) {
          for (const version of versionList) {
            if (target === undefined || version.versionNumber > target.versionNumber) {
              target = version;
            }
          }
        }
        if (target === undefined) {
          throw new Error(`Kịch bản "${flowId}" chưa có phiên bản nào`);
        }
        const loaded = await getVersion(flowId, target.id);
        if (cancelled) {
          return;
        }
        const canvas = toCanvas(loaded.document);
        setNodes(canvas.nodes);
        setEdges(canvas.edges);
        setMedia(mediaList);
        setQueues(queueList);
        setVersions(versionList);
        setOpenVersionId(target.id);
        setFlow(flows.find((each) => each.id === flowId));
        // Đầu số của kịch bản: DID có publishedVersionId thuộc kịch bản này
        // (bất kỳ phiên bản nào, không chỉ bản đang mở trên canvas).
        const versionIds = new Set(versionList.map((each) => each.id));
        setDid(dids.find((each) => each.publishedVersionId !== null && versionIds.has(each.publishedVersionId)));
        setLoadedDoc(fromCanvas(canvas.nodes, canvas.edges));
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

  // version-select: nạp bản đã chọn thẳng vào canvas, bỏ sửa đổi chưa lưu,
  // không hỏi (Quy ước chung lô 9). Không đi qua reload()/phase="loading" —
  // đổi bản để xem là một lần đọc, không phải tải lại toàn màn.
  const pickVersion = useCallback(
    (versionId: string) => {
      // Đường nạp thứ ba cạnh lưu và khôi phục — dùng CHUNG busyRef, thoát
      // sớm nếu một trong hai thao tác kia đang chạy (review BLOCKING "Chọn
      // phiên bản trong lúc đang lưu làm đầu trang trỏ sai bản").
      if (busyRef.current) {
        return;
      }
      busyRef.current = true;
      setPickingVersion(true);
      setPickError("");
      (async () => {
        try {
          const loaded = await getVersion(flowId, versionId);
          if (!aliveRef.current) {
            return;
          }
          const canvas = toCanvas(loaded.document);
          setNodes(canvas.nodes);
          setEdges(canvas.edges);
          setOpenVersionId(versionId);
          setValidation(null);
          // Chọn bản khác là đường nạp mới — xoá save-status cũ ("Đã lưu bản nháp
          // v3") để không còn thông báo của bản trước dính lại (review "Ngoài
          // phạm vi"). Nếu test đỏ vì dòng này thì bỏ (lot-brief mục 17).
          setSave({ state: "idle" });
          setLoadedDoc(fromCanvas(canvas.nodes, canvas.edges));
        } catch (error) {
          // Giữ nguyên canvas hiện tại — version-select vẫn hiện giá trị cũ,
          // người dùng thử chọn lại được. Báo lỗi đọc được thay vì nuốt lặng
          // lẽ (review MINOR "pickVersion nuốt lỗi đọc phiên bản").
          if (aliveRef.current) {
            setPickError(
              `Không đọc được phiên bản: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        } finally {
          busyRef.current = false;
          if (aliveRef.current) {
            setPickingVersion(false);
          }
        }
      })();
    },
    [flowId],
  );

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
      // Kéo bắt đầu thì ẩn tooltip — chuột không rời mục nên mouseleave không bắn.
      setTip(null);
      dragTypeRef.current = type;
      event.dataTransfer.setData("application/reactflow", type);
      event.dataTransfer.effectAllowed = "move";
    },
    [],
  );

  // Bấm toggle: đổi trạng thái palette và ẩn tooltip (Quy ước chung lô 10).
  const togglePalette = useCallback(() => {
    setTip(null);
    setPaletteOpen((open) => !open);
  }, []);

  const hideTip = useCallback(() => setTip(null), []);

  // Tooltip chỉ có khi thu gọn — lúc mở, nhãn đã hiện ngay trên mục.
  const showTip = useCallback(
    (event: MouseEvent<HTMLDivElement>, type: StepType) => {
      if (paletteOpen) {
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      setTip({
        label: stepLabel(type),
        x: Math.round(rect.right + 9),
        y: Math.round((rect.top + rect.bottom) / 2),
      });
    },
    [paletteOpen],
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

  // Đổi phím của Menu (Quy ước lô 11 "Đổi phím"): cạnh bám điểm nối cũ đổi
  // sourceHandle và id → `e-<nodeId>-<handle mới>` theo quy ước toCanvas
  // (src/flow/canvas.ts:61), giữ nguyên đích — chạy CÙNG LƯỢT với
  // onDataChange của Inspector (React gộp hai setState trong một handler).
  const renameBranchEdges = useCallback(
    (nodeId: string, oldHandle: string, newHandle: string) => {
      setEdges((current) =>
        current.map((edge) =>
          edge.source === nodeId && edge.sourceHandle === oldHandle
            ? { ...edge, id: `e-${nodeId}-${newHandle}`, sourceHandle: newHandle }
            : edge,
        ),
      );
    },
    [],
  );

  // Nút › của inspector — bỏ selected mọi node, khung đóng theo (Quy ước
  // lô 11: onClose đặt ở BuilderScreen).
  const clearSelection = useCallback(() => {
    setNodes((current) =>
      current.map((node) => (node.selected ? { ...node, selected: false } : node)),
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
          // Lưu xong = bản vừa lưu, KHÔNG nạp lại canvas (Quy ước chung lô 9).
          setVersions((current) => [...current, saved]);
          setOpenVersionId(saved.id);
          setLoadedDoc(doc);
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
          const draft = await saveDraft(flowId, document, versionId);
          if (aliveRef.current) {
            // Khôi phục xong = nháp mới — effect tải đọc target này qua ref
            // (Quy ước chung lô 9).
            targetVersionRef.current = draft.id;
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
  const catalog = useMemo(() => ({ media, queues }), [media, queues]);
  // Cạnh tô màu lúc render (AC-31) — memo hoá vì styledEdges tạo mảng mới
  // mỗi lần gọi; gọi thẳng trong JSX làm mọi thẻ render lại theo tham chiếu
  // (review vòng 3 lô 7 MINOR). Bảng id→loại dựng theo khoá chuỗi "id:type",
  // chỉ đổi khi thêm/xoá/đổi loại node — kéo node (đổi position) không làm
  // canvasEdges tính lại (review vòng 3 lô 7 MINOR 3).
  const nodeTypeKey = nodes.map((node) => `${node.id}:${node.type ?? ""}`).join(",");
  const typeById = useMemo(
    () =>
      new Map(
        nodeTypeKey === ""
          ? []
          : nodeTypeKey.split(",").map((entry): [string, string] => {
              const sep = entry.indexOf(":");
              return [entry.slice(0, sep), entry.slice(sep + 1)];
            }),
      ),
    [nodeTypeKey],
  );
  const canvasEdges = useMemo(() => styledEdges(edges, typeById), [edges, typeById]);

  // canvas-status + dirty-status dùng CHUNG một useMemo (lot-brief lô 9, mục
  // Rủi ro): currentDoc là tài liệu tương ứng canvas hiện tại, tính trực
  // tiếp — không phụ thuộc nút Kiểm tra hợp lệ. canvasErrorCount đếm issue
  // mức error (cảnh báo schedule KHÔNG tính — chỉ ảnh hưởng khi có lỗi thật).
  const { canvasErrorCount, isDirty } = useMemo(() => {
    const doc = fromCanvas(nodes, edges);
    const errorCount = collectIssues(doc).issues.filter((issue) => issue.severity === "error").length;
    const dirty = loadedDoc === null ? false : !jsonEqual(doc, loadedDoc);
    return { canvasErrorCount: errorCount, isDirty: dirty };
  }, [nodes, edges, loadedDoc]);

  // Mở drawer: xoá lỗi khôi phục cũ để lần mở sau không hiện lại thông báo
  // của lần trước (plan.md Tự quyết iter 9).
  const openVersions = useCallback(() => {
    setRestoreError("");
    setVersionsOpen(true);
  }, []);
  const closeVersions = useCallback(() => setVersionsOpen(false), []);

  const openVersion = versions.find((version) => version.id === openVersionId);

  // Dòng phụ đầu trang: provider · kind của đầu số đang gán, bỏ khoá null;
  // rỗng thì không render (Quy ước chung lô 10, bản dựng thử dòng 285).
  const builderMeta = [did?.provider, did?.kind]
    .filter((part): part is string => part !== null && part !== undefined)
    .join(" · ");

  // Chữ và icon nút thu/mở palette — bản dựng thử dòng 1686-1687.
  const paletteToggleTitle = paletteOpen ? "Thu gọn thư viện node" : "Mở rộng thư viện node";
  const paletteToggleIcon = paletteOpen ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6";

  return (
    <div className="builder">
      <div className="builder-toolbar" data-testid="builder-toolbar">
        <a
          className="builder-nav-numbers"
          data-testid="nav-numbers"
          href="#/numbers"
          aria-label="Về danh sách đầu số"
        >
          ←
        </a>
        {/* Khối tên hai dòng (bản dựng thử 280-286) — con co giãn DUY NHẤT của
            hàng: mọi phần tử khác flex:none nên đổi chữ ở đâu cũng không đẩy
            nhóm nút ghim phải (builder-actions margin-left:auto). */}
        <div className="builder-name" data-testid="builder-name">
          <div className="builder-name-line">
            <span className="builder-number num" data-testid="builder-number">
              {did?.number ?? "Chưa gán đầu số"}
            </span>
            <span className="builder-flow-name" data-testid="builder-flow-name">
              {flow?.name ?? ""}
            </span>
          </div>
          {builderMeta !== "" ? (
            <div className="builder-meta" data-testid="builder-meta">
              {builderMeta}
            </div>
          ) : null}
        </div>
        <select
          className="builder-version-select num"
          data-testid="version-select"
          value={openVersionId ?? ""}
          onChange={(event) => pickVersion(event.target.value)}
          disabled={phase !== "ready" || save.state === "saving" || restoring || pickingVersion}
        >
          {versions.map((version) => (
            <option key={version.id} value={version.id}>
              v{version.versionNumber} · {VERSION_SELECT_WORD[version.status]}
            </option>
          ))}
        </select>
        {openVersion !== undefined ? (
          <span
            className="builder-version-status"
            data-testid="version-status"
            style={{
              background: VERSION_STATUS_INFO[openVersion.status].bg,
              color: VERSION_STATUS_INFO[openVersion.status].color,
            }}
          >
            <span
              className="status-dot"
              data-testid="status-dot"
              style={{ background: VERSION_STATUS_INFO[openVersion.status].dot }}
            />
            {VERSION_STATUS_INFO[openVersion.status].label}
          </span>
        ) : null}
        {/* Bấm được ở MỌI phase (kể cả error) — chỉ mở, không đảo trạng thái
            (3-plan-05). */}
        <button type="button" data-testid="versions-open" onClick={openVersions}>
          Phiên bản · {versions.length}
        </button>
        {/* Nhóm ghim phải (bản dựng thử 295-303): margin-left:auto nên mép phải
            của nó luôn sát đệm đầu trang — phần tử ĐỨNG TRƯỚC đổi bề rộng (vd
            "Phiên bản · 3") không đẩy các nút trong nhóm. Mọi thông báo
            (save-status, validate-result, pick-error, new-flow-error) rời hàng,
            xuống canvas-hud — Quy ước chung lô 10. */}
        <div className="builder-actions">
          <span
            className="builder-dirty-status num"
            data-testid="dirty-status"
            data-state={isDirty ? "unsaved" : "saved"}
          >
            {isDirty ? "chưa lưu" : "đã lưu"}
          </span>
          <button
            type="button"
            data-testid="validate"
            onClick={handleValidate}
            disabled={phase !== "ready"}
          >
            Kiểm tra hợp lệ
          </button>
          <button
            type="button"
            className="builder-save-draft"
            data-testid="save-draft"
            onClick={handleSave}
            disabled={phase !== "ready" || save.state === "saving" || restoring || pickingVersion}
          >
            Lưu nháp
          </button>
          <button type="button" data-testid="new-flow" onClick={handleNewFlow} disabled={creating}>
            Kịch bản mới
          </button>
        </div>
      </div>
      <div className="builder-body">
        <div
          className="builder-palette"
          data-testid="palette"
          data-state={paletteOpen ? "expanded" : "collapsed"}
        >
          <div className="palette-head">
            {paletteOpen ? (
              <div className="palette-title" data-testid="palette-title">
                Thư viện node
              </div>
            ) : null}
            <button
              type="button"
              className="palette-toggle"
              data-testid="palette-toggle"
              title={paletteToggleTitle}
              aria-label={paletteToggleTitle}
              onClick={togglePalette}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={paletteToggleIcon} />
              </svg>
            </button>
          </div>
          <div className="palette-list">
            {PALETTE_GROUPS.map((group) => (
              <div key={group.name} className="palette-group">
                {paletteOpen ? (
                  <div className="palette-group-name" data-testid="palette-group-name">
                    {group.name}
                  </div>
                ) : (
                  // Thu gọn: nhóm ngăn nhau bằng vạch 1px thay cho tên nhóm
                  // (bản dựng thử dòng 337).
                  <div className="palette-group-sep" />
                )}
                <div className="palette-items">
                  {group.types.map((type) => (
                    <div
                      key={type}
                      className="builder-palette-item"
                      draggable
                      data-testid="palette-item"
                      data-node-type={type}
                      aria-label={stepLabel(type)}
                      onDragStart={(event) => onPaletteDragStart(event, type)}
                      onDragEnd={onPaletteDragEnd}
                      onMouseEnter={(event) => showTip(event, type)}
                      onMouseLeave={hideTip}
                    >
                      <span
                        className="palette-code"
                        data-testid="palette-code"
                        style={{
                          background: `var(--n-${tokenSuffix(type)}-s)`,
                          color: `var(--n-${tokenSuffix(type)}-t)`,
                          borderColor: `var(--n-${tokenSuffix(type)}-b)`,
                        }}
                      >
                        {stepCode(type)}
                      </span>
                      {paletteOpen ? (
                        <span className="palette-label" data-testid="palette-label">
                          {stepLabel(type)}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {tip !== null ? (
            <div
              className="palette-tooltip"
              data-testid="palette-tooltip"
              role="tooltip"
              style={{ left: tip.x, top: tip.y, transform: "translateY(-50%)" }}
            >
              {tip.label}
            </div>
          ) : null}
        </div>
        <div className="builder-canvas">
          {/* HUD góc trên trái của canvas, có ở MỌI phase: canvas-status (chỉ
              khi ready) rồi tới mọi thông báo — chúng rời builder-toolbar để
              đổi chữ không xê dịch hàng đầu trang (Quy ước chung lô 10).
              pointer-events:none để không chắn thao tác trên canvas (kể cả bỏ
              chọn bằng .react-flow__pane). */}
          <div className="canvas-hud">
            {phase === "ready" ? (
              <span className="canvas-status num" data-testid="canvas-status">
                {nodes.length} node <span className="canvas-status-sep">·</span> {edges.length} nhánh{" "}
                <span className="canvas-status-sep">·</span>{" "}
                <span className={canvasErrorCount > 0 ? "canvas-status-warn" : "canvas-status-ok"}>
                  {canvasErrorCount > 0 ? `${canvasErrorCount} cảnh báo` : "hợp lệ"}
                </span>
              </span>
            ) : null}
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
            {pickError !== "" ? (
              <span className="builder-pick-error" data-testid="pick-error" role="alert">
                {pickError}
              </span>
            ) : null}
            {newFlowError !== "" ? (
              <span className="builder-new-flow-error" data-testid="new-flow-error" role="alert">
                {newFlowError}
              </span>
            ) : null}
          </div>
          {phase === "loading" ? (
            <p className="builder-loading">Đang tải…</p>
          ) : phase === "error" ? (
            <ErrorState message={`Không tải được kịch bản: ${errorMessage}`} onRetry={reload} />
          ) : (
            <>
              <NodeIssuesContext.Provider value={issuesByNode}>
                <CatalogContext.Provider value={catalog}>
                  <ReactFlow
                    nodes={nodes}
                    edges={canvasEdges}
                    nodeTypes={nodeTypes}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    fitView
                  >
                    <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="var(--grid)" />
                    <Controls position="bottom-right" showInteractive={false} />
                    <MiniMap
                      position="bottom-left"
                      style={{ width: 152, height: 104 }}
                      nodeColor={(node) => `var(--n-${tokenSuffix(node.type ?? "")}-b)`}
                      maskStrokeColor="var(--acc)"
                    />
                  </ReactFlow>
                </CatalogContext.Provider>
              </NodeIssuesContext.Provider>
            </>
          )}
        </div>
        {phase === "ready" && selectedNode !== undefined ? (
          <Inspector
            node={selectedNode}
            media={media}
            queues={queues}
            onDataChange={(data) => changeNodeData(selectedNode.id, data)}
            onBranchRemoved={(handle) => removeBranchEdges(selectedNode.id, handle)}
            onBranchRenamed={(oldHandle, newHandle) =>
              renameBranchEdges(selectedNode.id, oldHandle, newHandle)
            }
            onClose={clearSelection}
          />
        ) : null}
        {/* Drawer position: absolute trong .builder-body (position:relative,
            không lề phải) — nằm dưới builder-toolbar, KHÔNG lớp phủ --scrim:
            nút đầu trang, palette, canvas thao tác được khi drawer mở (lô 9).
            Khôi phục do trình dựng đảm nhiệm (handleRestore) — drawer chỉ
            hiển thị danh sách và chuyển tiếp lệnh; busy khoá cả nút khôi phục
            lẫn nút Lưu nháp trong lúc một thao tác ghi đang chạy (review iter
            10 BLOCKING). */}
        {versionsOpen ? (
          <VersionsDrawer
            flowId={flowId}
            reloadKey={versionsKey}
            busy={restoring || save.state === "saving" || pickingVersion}
            restoreError={restoreError}
            openVersionId={openVersionId}
            onClose={closeVersions}
            onRestore={handleRestore}
          />
        ) : null}
      </div>
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
