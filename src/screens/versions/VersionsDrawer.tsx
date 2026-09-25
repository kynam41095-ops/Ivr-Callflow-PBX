import { useCallback, useEffect, useState } from "react";
import "./versions.css";
import { listVersions, type FlowVersionSummary } from "../../data/api";
import { ErrorState } from "../../ui/ErrorState";

// Nhãn trạng thái chip trong drawer — bản dựng thử dòng 1895-1897: Đang chạy /
// Nháp / Lưu trữ (lô 9). version-status ở đầu trang trình dựng vẫn giữ "Bản nháp"
// (VERSION_STATUS_INFO của BuilderScreen, chrome-visual.spec.ts:123).
const STATUS_LABELS: Record<FlowVersionSummary["status"], string> = {
  draft: "Nháp",
  published: "Đang chạy",
  archived: "Lưu trữ",
};

// Màu chip theo trạng thái — cùng bảng màu với number-status/version-status
// của builder-toolbar (tokens.css --ok/--warn/--bg-muted).
const STATUS_COLOR: Record<FlowVersionSummary["status"], { bg: string; color: string; dot: string }> = {
  draft: { bg: "var(--warn-soft)", color: "var(--warn)", dot: "var(--warn-dot)" },
  published: { bg: "var(--ok-soft)", color: "var(--ok)", dot: "var(--ok-dot)" },
  archived: { bg: "var(--bg-muted)", color: "var(--fg-2)", dot: "var(--fg-3)" },
};

// Xếp versionNumber giảm dần — bản mới nhất trên cùng (3-plan-05).
function byNumberDesc(a: FlowVersionSummary, b: FlowVersionSummary): number {
  return b.versionNumber - a.versionNumber;
}

// version-meta: "dd/mm/yyyy hh:mm" ghép bằng padStart, không dùng
// toLocaleString (giờ đứng trước, có giây — lệch bản dựng thử dòng 1600:
// "20/08/2026 09:40", review BLOCKING "Thẻ phiên bản trong drawer lệch giá
// trị bản dựng thử").
function formatMeta(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Drawer phiên bản: chỉ còn danh sách + hiển thị (TC-FLOW-022). Thao tác khôi
// phục do trình dựng đảm nhiệm (handleRestore) — drawer chuyển tiếp lệnh qua
// onRestore và phản ánh trạng thái qua busy (khoá nút khi đang lưu/khôi phục)
// cùng restoreError. Tách ra để đóng drawer giữa chừng không làm mất khoá ghi
// dùng chung (review iter 10 BLOCKING). reloadKey tăng mỗi lần trình dựng
// lưu/khôi phục thành công → drawer đang mở tự nạp lại danh sách.
// openVersionId (lô 9): bản đang mở trên canvas — đúng một version-item mang
// version-open, đổi theo khi trình dựng chọn version-select khác.
export function VersionsDrawer({
  flowId,
  reloadKey,
  busy,
  restoreError,
  openVersionId,
  onClose,
  onRestore,
}: {
  flowId: string;
  reloadKey: number;
  busy: boolean;
  restoreError: string;
  openVersionId: string | null;
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
        <button
          type="button"
          className="versions-close"
          data-testid="versions-close"
          aria-label="Đóng"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="versions-body">
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
              {versions.map((version) => {
                const colors = STATUS_COLOR[version.status];
                return (
                  <li
                    key={version.id}
                    className="version-item"
                    data-testid="version-item"
                    data-status={version.status}
                    data-version-id={version.id}
                  >
                    <div className="version-item-head">
                      <span className="version-code num" data-testid="version-code">
                        v{version.versionNumber}
                      </span>
                      <span
                        className="version-chip"
                        data-testid="version-chip"
                        style={{ background: colors.bg, color: colors.color }}
                      >
                        <span className="version-chip-dot" style={{ background: colors.dot }} />
                        {STATUS_LABELS[version.status]}
                      </span>
                      {version.id === openVersionId ? (
                        <span className="version-open" data-testid="version-open">
                          Đang mở
                        </span>
                      ) : null}
                    </div>
                    <div className="version-name" data-testid="version-name">
                      {version.name}
                    </div>
                    <div className="version-note" data-testid="version-note">
                      {version.note}
                    </div>
                    <div className="version-meta num" data-testid="version-meta">
                      {version.createdBy} · {formatMeta(version.createdAt)}
                    </div>
                    <div className="version-actions">
                      <button
                        type="button"
                        data-testid="version-restore"
                        onClick={() => onRestore(version.id)}
                        disabled={busy}
                      >
                        Khôi phục
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </aside>
  );
}
