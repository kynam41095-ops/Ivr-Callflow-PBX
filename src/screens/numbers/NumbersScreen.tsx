import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import "./numbers.css";
import {
  createPhoneNumber,
  listFlows,
  listPhoneNumbers,
  type Did,
  type FlowSummary,
} from "../../data/api";
import { ErrorState } from "../../ui/ErrorState";

type Phase = "loading" | "ready" | "error";

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
  const [errorMessage, setErrorMessage] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Tải qua ranh giới dữ liệu, cờ huỷ trong cleanup như BuilderScreen —
  // StrictMode chạy effect hai lần, rời màn giữa chừng không setState,
  // không để Promise reject trôi thành pageerror.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [numberList, flowList] = await Promise.all([listPhoneNumbers(), listFlows()]);
        if (cancelled) {
          return;
        }
        setDids(numberList);
        setFlows(flowList);
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

  return (
    <div className="numbers" data-testid="numbers-screen">
      <div className="numbers-toolbar">
        <button
          type="button"
          data-testid="number-create"
          onClick={openDialog}
          disabled={phase !== "ready"}
        >
          Thêm đầu số
        </button>
      </div>
      {phase === "loading" ? (
        <p className="numbers-loading">Đang tải…</p>
      ) : phase === "error" ? (
        <ErrorState message={`Không tải được danh sách đầu số: ${errorMessage}`} onRetry={reload} />
      ) : dids.length === 0 ? (
        <p className="numbers-empty" data-testid="numbers-empty">
          Chưa có đầu số nào
        </p>
      ) : (
        <table className="numbers-table">
          <thead>
            <tr>
              <th scope="col">Số</th>
              <th scope="col">Kịch bản đang chạy</th>
            </tr>
          </thead>
          <tbody>
            {dids.map((did) => {
              const flow = flowOf(did);
              return (
                <tr
                  key={did.id}
                  data-testid="number-row"
                  data-did-id={did.id}
                  data-published-version-id={did.publishedVersionId ?? undefined}
                >
                  <td data-testid="number-value">{did.number}</td>
                  {/* Ô kịch bản không bao giờ rỗng: chưa gán → "Chưa có kịch
                      bản"; gán mà không tìm ra → "Không tìm thấy kịch bản
                      đang chạy" (3-plan-05). */}
                  <td data-testid="number-flow">
                    {did.publishedVersionId === null
                      ? "Chưa có kịch bản"
                      : flow === undefined
                        ? "Không tìm thấy kịch bản đang chạy"
                        : // Id thô, không encodeURIComponent — flowId là uuid
                          // (plan.md Tự quyết iter 5).
                          <a href={`#/flows/${flow.id}`}>{flow.name}</a>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {dialogOpen ? (
        <CreateNumberDialog onClose={closeDialog} onCreated={handleCreated} />
      ) : null}
    </div>
  );
}
