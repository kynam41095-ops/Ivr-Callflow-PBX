import { useCallback, useEffect, useState } from "react";
import "./versions.css";
import { listVersions, type FlowVersionSummary } from "../../data/api";
import { ErrorState } from "../../ui/ErrorState";

// Nhãn trạng thái tiếng Việt của §3.8 (drawer phiên bản).
const STATUS_LABELS: Record<FlowVersionSummary["status"], string> = {
  draft: "Bản nháp",
  published: "Đang chạy",
  archived: "Đã lưu trữ",
};

// Xếp versionNumber giảm dần — bản mới nhất trên cùng (3-plan-05).
function byNumberDesc(a: FlowVersionSummary, b: FlowVersionSummary): number {
  return b.versionNumber - a.versionNumber;
}

// Drawer phiên bản: chỉ còn danh sách + hiển thị (TC-FLOW-022). Thao tác khôi
// phục do trình dựng đảm nhiệm (handleRestore) — drawer chuyển tiếp lệnh qua
// onRestore và phản ánh trạng thái qua busy (khoá nút khi đang lưu/khôi phục)
// cùng restoreError. Tách ra để đóng drawer giữa chừng không làm mất khoá ghi
// dùng chung (review iter 10 BLOCKING). reloadKey tăng mỗi lần trình dựng
// lưu/khôi phục thành công → drawer đang mở tự nạp lại danh sách.
export function VersionsDrawer({
  flowId,
  reloadKey,
  busy,
  restoreError,
  onClose,
  onRestore,
}: {
  flowId: string;
  reloadKey: number;
  busy: boolean;
  restoreError: string;
  onClose: () => void;
  onRestore: (versionId: string) => void;
}) {
  const [versions, setVersions] = useState<FlowVersionSummary[] | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [retryToken, setRetryToken] = useState(0);

  // Tải danh sách phiên bản. Lỗi → ErrorState + retry (tăng retryToken để chạy
  // lại chính effect này). Sau khi khôi phục thành công, việc đọc lại danh sách
  // cũng đi qua effect này (reloadKey đổi) chứ KHÔNG nằm trong catch của khôi
  // phục — nên đọc lỗi thì hiện retry, nút khôi phục ẩn, không tạo nháp trùng
  // (review iter 9 BLOCKING).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listVersions(flowId);
        if (cancelled) {
          return;
        }
        setVersions(list.sort(byNumberDesc));
        setErrorMessage("");
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : String(error));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [flowId, reloadKey, retryToken]);

  const handleRetry = useCallback(() => {
    setRetryToken((token) => token + 1);
  }, []);

  return (
    <aside
      className="versions-drawer"
      data-testid="versions-drawer"
      aria-label="Phiên bản kịch bản"
    >
      <div className="versions-drawer-header">
        <h2>Phiên bản kịch bản</h2>
        <button type="button" data-testid="versions-close" onClick={onClose}>
          Đóng
        </button>
      </div>
      {errorMessage !== "" ? (
        <ErrorState
          message={`Không tải được danh sách phiên bản: ${errorMessage}`}
          onRetry={handleRetry}
        />
      ) : versions === null ? (
        <p className="versions-loading">Đang tải…</p>
      ) : (
        <>
          {restoreError !== "" ? (
            <p className="versions-restore-error" data-testid="restore-error" role="alert">
              {restoreError}
            </p>
          ) : null}
          <ul className="versions-list">
            {versions.map((version) => (
              <li
                key={version.id}
                className="version-item"
                data-testid="version-item"
                data-status={version.status}
                data-version-id={version.id}
              >
                <span className="version-item-title">
                  v{version.versionNumber} — {STATUS_LABELS[version.status]}
                </span>
                <span className="version-item-meta">
                  {new Date(version.createdAt).toLocaleString("vi-VN")} · {version.createdBy}
                </span>
                <button
                  type="button"
                  data-testid="version-restore"
                  onClick={() => onRestore(version.id)}
                  disabled={busy}
                >
                  Khôi phục
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
