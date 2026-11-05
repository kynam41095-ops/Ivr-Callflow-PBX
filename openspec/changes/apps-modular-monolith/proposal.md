# Proposal

## Why

Repo hiện chỉ có một app (`services/frontend`) và toàn bộ dữ liệu giao diện là kho giả lập
trong bộ nhớ (`src/data/api.ts`), nên chưa có chỗ nào chạy phía máy chủ. Người đặt việc muốn
**chỉ đổi cấu trúc repo và khởi tạo backend trước**: repo về dạng modular monolith với
`apps/frontend` và `apps/backend`, backend dựng bằng NestJS bản ổn định mới nhất. Làm theo quy
trình OpenSpec: propose trước, người yêu cầu duyệt rồi mới apply.

Change này chỉ tạo bộ artifact propose; **không** đổi mã nguồn. Sau khi duyệt: `openspec/specs/`
chưa đổi, `services/` vẫn còn nguyên, `contracts/` không bị chạm tới.

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
  quy ước module backend, và việc TypeScript bị ghim ở 6 cho tới khi Nest hỗ trợ 7. `openspec/config.yaml`
  được bổ sung nguyên văn khối `rules` (design, tasks) và `operations.apply.guidance` theo yêu cầu.
- **Không** có việc nào liên quan contract: `contracts/` giữ nguyên tại gốc, không di chuyển, không
  sửa, không thêm endpoint nào theo contract.

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
- `apps/frontend/src` cách gốc repo đúng ba cấp như `services/frontend/src`, nên mọi đường dẫn
  tương đối tính theo độ sâu đó (kể cả `src/contracts.ts` đọc `contracts/` ở gốc) giữ nguyên giá
  trị — chỉ comment nhắc `services/` phải sửa chữ.
- Build: thêm Dockerfile thứ hai; `compose.yaml` có thêm service `backend` (cổng 3000) và
  `backend-test`.
- Dependency: thêm `@nestjs/{common,core,platform-express}`, `reflect-metadata`, `rxjs`, và bộ
  dev của Nest 12 (CLI, testing, vitest, supertest) — chỉ trong `apps/backend/package.json`,
  frontend không đổi dependency.
- Test: frontend giữ nguyên 64 unit + 81 e2e (baseline đo hôm nay, xanh) — đây là bằng chứng hồi
  quy của việc đổi layout; backend thêm test khung (unit + e2e bằng Vitest/supertest).
- Tài liệu: `README.md`, `AGENTS.md`, `openspec/config.yaml`, `apps/frontend/README.md`.
- Không đụng: `contracts/`, `openspec/specs/**`, mã nghiệp vụ của frontend.
