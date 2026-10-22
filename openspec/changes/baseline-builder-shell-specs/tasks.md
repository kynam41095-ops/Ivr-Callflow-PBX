# Tasks

## 1. Kiểm hình thức bộ spec

- [ ] 1.1 Chạy `openspec validate baseline-builder-shell-specs --strict` và sửa mọi cảnh báo (mô tả requirement ≤ 500 ký tự, scenario đúng 4 dấu `#`, mỗi requirement có ít nhất một scenario). Kiểm: lệnh exit 0, không còn dòng `warning`.
- [ ] 1.2 Kiểm đủ 8 capability so với proposal: `builder-shell`, `flow-canvas`, `node-inspector`, `draft-authoring`, `flow-validation`, `version-history`, `number-management`, `visual-theme`. Kiểm: `ls openspec/changes/baseline-builder-shell-specs/specs | wc -l` = 8.

## 2. Đối chiếu scenario với test đang xanh

- [ ] 2.1 Lập bảng ánh xạ từng `#### Scenario:` sang file test và tên test đang xanh, ghi vào cuối `tasks.md` hoặc `design.md` của change (chỉ ghi chú, không thêm file mới). Kiểm: mỗi scenario có ít nhất một dòng ánh xạ hoặc nhãn `chưa có test`.
- [ ] 2.2 Với scenario chưa có test, ghi rõ lý do (hành vi chưa kiểm được tự động) và **không** sửa spec để khớp test. Kiểm: không scenario nào bị xoá hoặc viết lại trong bước này (`git diff` chỉ thêm ghi chú).
- [ ] 2.3 Xác nhận lại bằng chứng nền: `docker compose --profile test run --rm frontend-test npm test` xanh (64 unit + 81 e2e) tại commit đang dùng để viết spec. Kiểm: log không có `failed`.

## 3. Chặn phạm vi sai

- [ ] 3.1 Kiểm không requirement nào mô tả hành vi chưa tồn tại: `grep -rniE "ban hành|xác thực|tenant|tải lên|máy chủ" openspec/changes/baseline-builder-shell-specs/specs`. Kiểm: mọi kết quả chỉ nói về việc **chưa** có (ví dụ trong `draft-authoring` về giới hạn bộ nhớ) hoặc nằm trong tên trạng thái `Đang chạy`.
- [ ] 3.2 Kiểm không requirement nào phụ thuộc tên class, hàm hay thư viện nội bộ: `grep -rnE "\b(React|Vite|Vitest|Playwright|useState|saveDraft|collectIssues)\b" openspec/changes/baseline-builder-shell-specs/specs`. Kiểm: rỗng.

## 4. Chuyển sang monorepo và đóng sổ

- [ ] 4.1 Sau khi `monorepo-hoa` hoàn tất, nếu monorepo được dựng tại chỗ (gốc hiện tại) thì change này đã nằm sẵn trong repo `app-business`; nếu dựng ở thư mục khác thì chuyển `openspec/changes/baseline-builder-shell-specs/` sang đó. Chạy `openspec validate baseline-builder-shell-specs --strict` trong monorepo. Kiểm: exit 0.
- [ ] 4.2 Kiểm đường dẫn được spec nhắc tới tồn tại trong monorepo: `contracts/flow-document.schema.json`. Kiểm: `test -f contracts/flow-document.schema.json`.

## Workflow follow-up

- Archive bằng `/openspec-archive-change`: archive sẽ ghi 25 requirement vào `openspec/specs/<capability>/spec.md` và sao `## Purpose` sang spec chính.
