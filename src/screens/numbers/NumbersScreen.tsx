import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import "./numbers.css";
import {
  createPhoneNumber,
  getVersion,
  listFlows,
  listPhoneNumbers,
  listVersions,
  type Did,
  type FlowSummary,
} from "../../data/api";
import { ErrorState } from "../../ui/ErrorState";

type Phase = "loading" | "ready" | "error";

// Thông tin dẫn xuất theo kịch bản (không thuộc contract Did/FlowSummary) —
// versionNumber/nodeCount của bản đang publish, hasDraft = có bản draft nào
// không. Tính một lần trong effect, tra theo flow.id lúc render bảng.
type FlowInfo = {
  versionNumber: number | null;
  nodeCount: number | null;
  hasDraft: boolean;
};

// Modal tạo đầu số — component con có state riêng (ô nhập, lỗi, đang gửi):
// đóng là unmount, mở lại là sạch (3-plan-05). <dialog> native mở bằng
// showModal() → role="dialog" và Escape đóng là hành vi sẵn có của trình duyệt.
function CreateNumberDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // submittingRef chặn gọi lại trước lần render kịp disable nút (bấm đúp,
  // Enter + click); aliveRef chặn setState sau unmount — như lô 4.
  const submittingRef = useRef(false);
  const aliveRef = useRef(false);

  // KHÔNG có cleanup gọi dialog.close(): StrictMode chạy mount → cleanup →
  // mount, close() trong cleanup bắn sự kiện close → onClose → cha đóng modal
  // trước khi nó kịp hiện (3-plan-05). Unmount tự gỡ <dialog> khỏi DOM.
  // Listener "close" nối Escape / number-cancel về state của cha.
  useEffect(() => {
    aliveRef.current = true;
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    // if (!dialog.open) chặn gọi showModal() lần hai của StrictMode.
    if (!dialog.open) {
      dialog.showModal();
    }
    dialog.addEventListener("close", onClose);
    return () => {
      aliveRef.current = false;
      dialog.removeEventListener("close", onClose);
    };
  }, [onClose]);

  const handleCancel = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  // Gửi: validate ở ranh giới (createPhoneNumber reject khi rỗng/quá dài/
  // trùng) — không validate trùng trong UI để đi đúng đường lỗi thật.
  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      if (submittingRef.current) {
        return;
      }
      submittingRef.current = true;
      setSubmitting(true);
      setErrorMessage("");
      (async () => {
        try {
          await createPhoneNumber(value);
          if (aliveRef.current) {
            onCreated();
          }
        } catch (error) {
          if (aliveRef.current) {
            setErrorMessage(error instanceof Error ? error.message : String(error));
            setSubmitting(false);
          }
        } finally {
          submittingRef.current = false;
        }
      })();
    },
    [value, onCreated],
  );

  return (
    <dialog
      ref={dialogRef}
      className="number-dialog"
      data-testid="number-dialog"
      aria-labelledby="number-dialog-title"
    >
      <h2 id="number-dialog-title">Tạo đầu số mới</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label className="number-dialog-label" htmlFor="number-dialog-input">
            Số điện thoại
          </label>
          {/* Không đặt maxLength — giới hạn 32 ký tự kiểm ở ranh giới, để ca
              33 ký tự đi đường lỗi thật (3-plan-05). */}
          <input
            id="number-dialog-input"
            data-testid="number-input"
            type="tel"
            value={value}
            autoFocus
            onChange={(event) => setValue(event.target.value)}
          />
          {errorMessage !== "" ? (
            <p className="number-create-error" data-testid="number-create-error" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </div>
        <div className="number-dialog-actions">
          {/* type="button" bắt buộc — thiếu là mặc định submit, bấm Huỷ lại
              tạo đầu số (3-plan-05). */}
          <button type="button" data-testid="number-cancel" onClick={handleCancel}>
            Huỷ
          </button>
          <button type="submit" data-testid="number-submit" disabled={submitting}>
            Tạo
          </button>
        </div>
      </form>
    </dialog>
  );
}

export default function NumbersScreen() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [dids, setDids] = useState<Did[]>([]);
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [flowInfo, setFlowInfo] = useState<Map<string, FlowInfo>>(new Map());
  const [errorMessage, setErrorMessage] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Tải qua ranh giới dữ liệu, cờ huỷ trong cleanup như BuilderScreen —
  // StrictMode chạy effect hai lần, rời màn giữa chừng không setState,
  // không để Promise reject trôi thành pageerror. Mỗi lần tải cũng kéo
  // listVersions/getVersion của từng kịch bản để có versionNumber/nodeCount/
  // hasDraft cho bảng — cùng một try nên lỗi ở đây vẫn chỉ ra đúng một
  // ErrorState (AC-25).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [numberList, flowList] = await Promise.all([listPhoneNumbers(), listFlows()]);
        if (cancelled) {
          return;
        }
        const infoEntries = await Promise.all(
          flowList.map(async (flow): Promise<[string, FlowInfo]> => {
            const versions = await listVersions(flow.id);
            const hasDraft = versions.some((version) => version.status === "draft");
            const published =
              flow.publishedVersionId === null
                ? undefined
                : versions.find((version) => version.id === flow.publishedVersionId);
            let nodeCount: number | null = null;
            if (published !== undefined) {
              const { document } = await getVersion(flow.id, published.id);
              nodeCount = Object.keys(document.nodes).length;
            }
            return [flow.id, { versionNumber: published?.versionNumber ?? null, nodeCount, hasDraft }];
          }),
        );
        if (cancelled) {
          return;
        }
        setDids(numberList);
        setFlows(flowList);
        setFlowInfo(new Map(infoEntries));
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
  }, [reloadToken]);

  const reload = useCallback(() => {
    setPhase("loading");
    setErrorMessage("");
    setReloadToken((token) => token + 1);
  }, []);

  const openDialog = useCallback(() => setDialogOpen(true), []);
  const closeDialog = useCallback(() => setDialogOpen(false), []);
  const handleCreated = useCallback(() => {
    setDialogOpen(false);
    reload();
  }, [reload]);

  // Tên kịch bản của dòng = join did.publishedVersionId với
  // flow.publishedVersionId (dữ liệu giả lập giữ bộ ba nhất quán, mock.ts;
  // không gọi listVersions từng kịch bản, không làm giàu Did — TC-PBX-009
  // cấm bản ghi đầu số mang tên kịch bản. plan.md Tự quyết iter 9).
  const flowOf = (did: Did): FlowSummary | undefined =>
    did.publishedVersionId === null
      ? undefined
      : flows.find((flow) => flow.publishedVersionId === did.publishedVersionId);

  // Ba thẻ thống kê đếm trên TOÀN danh sách, không theo ô tìm (lot-brief
  // §Quy ước chung). drafts đếm số dòng sẽ có number-draft, tức flow được
  // gán có bất kỳ phiên bản draft nào.
  const total = dids.length;
  const active = dids.filter((did) => did.publishedVersionId !== null).length;
  const drafts = dids.filter((did) => {
    const flow = flowOf(did);
    return flow !== undefined && (flowInfo.get(flow.id)?.hasDraft ?? false);
  }).length;

  const term = search.trim().toLowerCase();
  const visibleDids =
    term === ""
      ? dids
      : dids.filter((did) => {
          const flow = flowOf(did);
          return (
            did.number.toLowerCase().includes(term) ||
            (flow !== undefined && flow.name.toLowerCase().includes(term))
          );
        });

  return (
    <div className="numbers" data-testid="numbers-screen">
      <div className="numbers-header">
        <h1>Quản lý đầu số</h1>
        <p>
          Mỗi đầu số gắn với một kịch bản IVR có phiên bản riêng. Bấm tên kịch bản để mở trình
          dựng luồng.
        </p>
      </div>

      <div className="number-stats">
        {(
          [
            {
              key: "total",
              label: "Tổng đầu số",
              value: total,
              hint: "Đang cấu hình trên hệ thống",
            },
            {
              key: "active",
              label: "Đang hoạt động",
              value: active,
              hint: "Có phiên bản đang chạy thật",
            },
            {
              key: "drafts",
              label: "Bản nháp chờ publish",
              value: drafts,
              hint: "Cần review trước khi phát hành",
            },
          ] as const
        ).map((stat) => (
          <div key={stat.key} className="number-stat" data-testid="number-stat" data-stat={stat.key}>
            <div className="number-stat-label">{stat.label}</div>
            <div className="number-stat-value num" data-testid="number-stat-value">
              {phase === "ready" ? stat.value : "—"}
            </div>
            <div className="number-stat-hint" data-testid="number-stat-hint">
              {stat.hint}
            </div>
          </div>
        ))}
      </div>

      <div className="numbers-toolbar">
        <input
          type="text"
          className="number-search"
          data-testid="number-search"
          placeholder="Tìm đầu số hoặc tên kịch bản…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="number-create-wrap">
          <button
            type="button"
            className="number-create"
            data-testid="number-create"
            onClick={openDialog}
            disabled={phase !== "ready"}
          >
            <span className="number-create-plus">+</span> Thêm
          </button>
        </div>
      </div>
      {phase === "loading" ? (
        <p className="numbers-loading">Đang tải…</p>
      ) : phase === "error" ? (
        <ErrorState message={`Không tải được danh sách đầu số: ${errorMessage}`} onRetry={reload} />
      ) : dids.length === 0 ? (
        <p className="numbers-empty" data-testid="numbers-empty">
          Chưa có đầu số nào
        </p>
      ) : visibleDids.length === 0 ? (
        <div className="numbers-table-wrap">
          <p className="numbers-filter-empty" data-testid="numbers-filter-empty">
            Không có đầu số nào khớp bộ lọc
          </p>
        </div>
      ) : (
        <div className="numbers-table-wrap">
          <table className="numbers-table">
            <thead>
              <tr>
                <th scope="col">Đầu số</th>
                <th scope="col">Nhà mạng</th>
                <th scope="col">Kịch bản</th>
                <th scope="col">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {visibleDids.map((did) => {
                const flow = flowOf(did);
                const info = flow !== undefined ? flowInfo.get(flow.id) : undefined;
                const versionNumber = info?.versionNumber ?? null;
                const isActive = did.publishedVersionId !== null;
                return (
                  <tr
                    key={did.id}
                    data-testid="number-row"
                    data-did-id={did.id}
                    data-published-version-id={did.publishedVersionId ?? undefined}
                  >
                    <td>
                      <span className="number-value num" data-testid="number-value">
                        {did.number}
                      </span>
                      {/* Ô kịch bản không bao giờ rỗng: chưa gán → "Chưa có kịch
                          bản"; gán mà không tìm ra → "Không tìm thấy kịch bản
                          đang chạy" (3-plan-05). */}
                      <div className="number-flow" data-testid="number-flow">
                        {did.publishedVersionId === null
                          ? "Chưa có kịch bản"
                          : flow === undefined
                            ? "Không tìm thấy kịch bản đang chạy"
                            : // Id thô, không encodeURIComponent — flowId là uuid
                              // (plan.md Tự quyết iter 5).
                              <a href={`#/flows/${flow.id}`}>{flow.name}</a>}
                      </div>
                    </td>
                    <td>
                      <span className="number-provider" data-testid="number-provider">
                        {did.provider ?? "—"}
                      </span>
                      <div className="number-kind" data-testid="number-kind">
                        {did.kind ?? "—"}
                      </div>
                    </td>
                    <td>
                      <div className="number-version-row">
                        <span
                          className="number-version num"
                          data-testid="number-version"
                          data-unpublished={versionNumber === null ? "true" : undefined}
                        >
                          {versionNumber === null ? "chưa publish" : `v${versionNumber}`}
                        </span>
                        <span className="number-node-count num" data-testid="number-node-count">
                          {info?.nodeCount != null ? `${info.nodeCount} node` : "—"}
                        </span>
                      </div>
                      {info?.hasDraft === true ? (
                        <div className="number-draft" data-testid="number-draft">
                          <span className="number-draft-dot" />
                          có bản nháp chưa publish
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <span
                        className="number-status"
                        data-testid="number-status"
                        data-state={isActive ? "active" : "draft"}
                      >
                        <span className="status-dot" data-testid="status-dot" />
                        {isActive ? "Hoạt động" : "Nháp"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {dialogOpen ? (
        <CreateNumberDialog onClose={closeDialog} onCreated={handleCreated} />
      ) : null}
    </div>
  );
}
