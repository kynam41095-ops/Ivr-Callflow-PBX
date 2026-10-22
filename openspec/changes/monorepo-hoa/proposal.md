# Proposal

## Why

Dự án đang là ba repo rời (`docs`, `frontend`, `backend`) với thư mục gốc **không** phải git repo, nên `openspec/` không thuộc version control nào và contract bị nhân đôi thành hai bản byte-identical (`docs/30-designs/contracts/flow-document.schema.json` và `frontend/contracts/flow-document.schema.json`). Chuyển sang một repo nhiều service, build bằng Dockerfile, để `openspec/` và contract có đúng một chỗ nằm và có lịch sử git.

## What Changes

- **BREAKING** đường dẫn mã nguồn: `frontend/` → `services/frontend/`. Mọi lệnh, script và tài liệu trỏ đường dẫn cũ phải đổi theo.
- Tạo repo monorepo tại thư mục gốc với remote `origin` = `https://gitlab19.mitek.vn/ivr-callflow-pbx/app-business.git`, đưa `services/frontend` vào bằng `git subtree add --prefix=services/frontend` từ nhánh `develop` của remote `frontend`, giữ nguyên sha commit cũ.
- **Chỉ repo gốc có git.** `services/*` không có `.git`; `frontend/.git`, `docs/.git`, `backend/.git` đều bị gỡ khỏi thư mục gốc. `docs/` và `backend/` được chuyển ra `../IVR-Callflow-PBX-archive/`, không xoá — `docs/30-designs/phase-01/` chưa từng commit nên chỉ tồn tại trên máy này.
- Contract còn **một bản duy nhất** ở `contracts/flow-document.schema.json`; gỡ `services/frontend/contracts/`, frontend import thẳng từ `contracts/`.
- Thêm `services/frontend/Dockerfile` multi-stage (build bằng Node rồi phục vụ `dist` tĩnh). `compose.yaml` build service từ Dockerfile này thay vì chạy `npm ci && npm run dev` trong image Playwright; giữ một profile riêng dùng image Playwright cho test e2e.
- Viết lại `AGENTS.md` theo mô hình mới: bỏ quy tắc `docs/`, bỏ yêu cầu mã FR/TC, trỏ OpenSpec là nguồn sự thật về hành vi.
- `openspec/config.yaml` khai `context` mô tả monorepo và cách build bằng Dockerfile.
- **Không** đưa `docs/` và `backend` vào repo mới. `docs` ngừng là nguồn chuẩn, lịch sử của nó ở lại remote `docs`. `backend` rỗng (remote chỉ có `README.md`), để dành cho service sau.

## Capabilities

### New Capabilities

Không có. Đây là thay đổi cấu trúc repo và đóng gói, không đổi hành vi nào của sản phẩm — `skip_specs: true` trong `.openspec.yaml`.

### Modified Capabilities

Không có.

## Impact

- Repo/CI: remote monorepo `https://gitlab19.mitek.vn/ivr-callflow-pbx/app-business.git`; `frontend` và `docs` thành remote chỉ đọc.
- Đường dẫn: toàn bộ `frontend/**` → `services/frontend/**`; `frontend/contracts/**` biến mất, thay bằng `contracts/**` ở gốc.
- Build: thêm `services/frontend/Dockerfile`; `compose.yaml` đổi cách dựng service `frontend`.
- Test: `npm test` của frontend chạy trong `services/frontend`; test sha256 của `TC-FLOW-014` đổi đường dẫn đối chiếu sang `contracts/flow-document.schema.json`.
- Tài liệu: `docs/` không còn trong repo; `AGENTS.md` thay đổi quy tắc bắt buộc.
