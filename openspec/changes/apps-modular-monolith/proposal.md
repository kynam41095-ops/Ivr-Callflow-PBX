# Proposal

## Why

Repo hiện chỉ có một app (`services/frontend`) và toàn bộ dữ liệu giao diện là kho giả lập
trong bộ nhớ (`src/data/api.ts` ghi rõ "đợt 1 thay bằng HTTP thật không đổi chữ ký"), nên chưa
có chỗ nào chạy nghiệp vụ phía máy chủ. Yêu cầu là đưa repo về dạng **modular monolith** với hai
app `apps/frontend` và `apps/backend`, backend dựng bằng NestJS bản ổn định mới nhất — và làm
theo quy trình OpenSpec: **propose trước, người yêu cầu duyệt rồi mới apply**.

Change này chỉ tạo bộ artifact propose; **không** đổi mã nguồn. Trạng thái mong đợi sau khi duyệt:
`openspec/specs/` chưa đổi, `services/` vẫn còn nguyên.

## What Changes

- **BREAKING** đổi layout: `services/frontend/` → `apps/frontend/` bằng `git mv` (giữ lịch sử
  file), thư mục `services/` biến mất. Mọi đường dẫn trong `README.md`, `AGENTS.md`,
  `compose.yaml`, `openspec/config.yaml`, `apps/frontend/Dockerfile` và `apps/frontend/README.md`
  phải trỏ theo tên mới.
- Thêm `apps/backend/` — khung **NestJS 12.3** (major ổn định hiện hành; Nest không công bố nhãn
  LTS, xem `design.md`) dạng modular monolith: `AppModule` gốc + mỗi miền nghiệp vụ một module
  riêng dưới `src/modules/<domain>/`, chưa có nghiệp vụ nào (xem Open Questions).
- **TypeScript 6.x, không phải 7**: NestJS CLI 12 hiện chặn TypeScript 7 vì TS 7.0 chỉ phát hành
  `tsc`, chưa có compiler API mà `nest build` cần (đo được, xem `design.md`). Đúng như yêu cầu,
  hạ xuống TS 6 cho backend. Frontend đang ở `~6.0.3` nên **không phải đổi**.
- Build/run: thêm `apps/backend/Dockerfile` (multi-stage, context = gốc repo như frontend),
  service `backend` trong `compose.yaml`, profile `test` cho test backend.
- Tài liệu và chính sách: `README.md`, `AGENTS.md`, `openspec/config.yaml` mô tả layout `apps/`,
  quy ước module backend, và việc TypeScript bị ghim ở 6 cho tới khi Nest hỗ trợ 7.

## Capabilities

### New Capabilities

- `service-health`: dịch vụ backend khởi động được, đọc cổng từ biến môi trường và trả trạng thái
  sẵn sàng qua HTTP — hành vi tối thiểu để khung backend kiểm chứng được, chưa gắn nghiệp vụ.

### Modified Capabilities

Không có. Chuyển layout `services/` → `apps/` và thêm khung dịch vụ không đổi yêu cầu nào của tám
capability hiện có (`builder-shell`, `draft-authoring`, `flow-canvas`, `flow-validation`,
`node-inspector`, `number-management`, `version-history`, `visual-theme`).

## Impact

- Đường dẫn: toàn bộ `services/frontend/**` → `apps/frontend/**`; hai nhánh remote còn commit
  riêng trên nền `services/` (`agent/readme-agent-line-…`, `wip/gitlab-intake-scripts`) phải
  rebase sau khi change được apply.
- Contract dùng chung vẫn ở `contracts/` gốc, **không** đổi vị trí: `apps/frontend/src` cách gốc
  đúng ba cấp như `services/frontend/src`, nên `src/contracts.ts` giữ nguyên nội dung.
- Build: thêm Dockerfile thứ hai; `compose.yaml` có thêm service `backend` (cổng 3000) và
  `backend-test`.
- Dependency: thêm `@nestjs/{common,core,platform-express}`, `reflect-metadata`, `rxjs`, và bộ
  dev của Nest 12 (CLI, testing, vitest, supertest) — chỉ trong `apps/backend/package.json`,
  frontend không đổi dependency.
- Test: frontend giữ nguyên 64 unit + 81 e2e (đo lại hôm nay, xanh); backend thêm test khung.
- Tài liệu: `README.md`, `AGENTS.md`, `openspec/config.yaml`, `apps/frontend/README.md`.
- Không đụng: `contracts/`, `openspec/specs/**`, mã nghiệp vụ của frontend.
