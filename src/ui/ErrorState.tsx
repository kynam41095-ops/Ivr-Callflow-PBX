import "./error-state.css";

// Trạng thái lỗi + nút thử lại dùng chung ở ba màn: đầu số, trình dựng,
// drawer phiên bản (TC-FLOW-023). Nút retry nằm TRONG phần tử role="alert"
// để page.getByRole("alert") chế độ strict vẫn đúng một kết quả.
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="error-state">
      <p>{message}</p>
      <button type="button" data-testid="retry" onClick={onRetry}>
        Thử lại
      </button>
    </div>
  );
}
