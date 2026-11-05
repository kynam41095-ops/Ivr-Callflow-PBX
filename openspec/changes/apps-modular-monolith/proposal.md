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
  `compose.yaml`, `AGENTS.md`, `apps/frontend/Dockerfile`, `apps/frontend/README.md` và comment
  trong `apps/frontend/src/contracts.ts` phải trỏ theo tên mới. Riêng `openspec/config.yaml`
  **không** sửa: nó được ghi đè nguyên văn theo yêu cầu.
- Thêm `apps/backend/` — khung **NestJS 12.3** (major ổn định hiện hành; Nest không công bố nhãn
  LTS, xem `design.md`) dạng modular monolith: `AppModule` gốc + mỗi miền nghiệp vụ một module
  riêng dưới `src/modules/<domain>/`, chưa có nghiệp vụ nào (xem Open Questions).
- **ESM**: backend dùng `"type": "module"` như mặc định của `nest new` 12 (đã chốt), nên import
  nội bộ ghi đuôi `.js`.
- **TypeScript 6.x, không phải 7**: NestJS CLI 12 hiện chặn TypeScript 7 vì TS 7.0 chỉ phát hành
  `tsc`, chưa có compiler API mà `nest build` cần (đo được, xem `design.md`). Đúng như yêu cầu,
  hạ xuống TS 6 cho backend. Frontend đang ở `~6.0.3` nên **không phải đổi**.
- Build/run: thêm `apps/backend/Dockerfile` (multi-stage, context = gốc repo như frontend),
  service `backend` trong `compose.yaml`, profile `test` cho test backend.
- Tài liệu và chính sách: `README.md`, `AGENTS.md` mô tả layout `apps/`, quy ước module backend, và
  việc TypeScript bị ghim ở 6 cho tới khi Nest hỗ trợ 7. `openspec/config.yaml` được **ghi đè
  nguyên văn** bằng file người đặt việc gửi (`schema` + `rules` cho proposal/specs/design/tasks +
  `operations.apply.guidance`), không thêm bớt.

## Non-Goals

- **Không viết nghiệp vụ phía máy chủ** (đầu số, kịch bản, phiên bản, media, hàng đợi). Backend chỉ
  là khung chạy được; miền nghiệp vụ đầu tiên sẽ là change riêng.
- **Không có việc nào liên quan contract**: `contracts/` giữ nguyên tại gốc repo, không di chuyển,
  không sửa nội dung, không thêm endpoint nào theo contract, không thêm `contracts:check`.
- **Không nối frontend sang gọi backend thật**: `apps/frontend/src/data/api.ts` vẫn là kho giả lập
  trong bộ nhớ; không đổi hành vi của tám capability frontend đang có.
- **Không thêm hạ tầng**: không PostgreSQL, không Redis, không hàng đợi, không xác thực, không
  khái niệm tenant.
- **Không thêm `package.json` ở gốc repo** (không npm workspaces, không thêm
  `npm run smoke/build/test:integration/contracts:check/test:e2e`).
- **Không dựng CI** (GitHub Actions hay khác) trong change này.
- **Không đổi `openspec/specs/**`** của tám capability đang có.

## Compatibility impact

- **Đường dẫn**: mọi lệnh, script, tài liệu đang trỏ `services/frontend` phải đổi sang
  `apps/frontend` — đây là thay đổi **phá vỡ** với người đang dùng đường dẫn cũ. Hai nhánh remote
  còn commit riêng trên nền `services/` phải rebase.
- **Hành vi sản phẩm**: không đổi. Frontend giữ nguyên 64 unit test và 81 e2e; backend là tiến
  trình mới, chỉ thêm code, không sửa mã frontend.
- **Contract**: không đổi. `contracts/flow-document.schema.json` giữ nguyên byte, và
  `apps/frontend/src` vẫn cách gốc ba cấp nên đường dẫn tương đối đọc contract giữ nguyên giá trị.
- **Runtime mới**: thêm image và service `backend` (cổng 3000) — máy dev cần cổng còn trống, hoặc
  đổi qua `BACKEND_PORT`.
- **Công cụ**: không ai phải đổi Node/npm trên máy; mọi thứ chạy trong container như hiện tại.

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
- Tài liệu: `README.md`, `AGENTS.md`, `apps/frontend/README.md`; `openspec/config.yaml` ghi đè nguyên
  văn theo yêu cầu (không phải sửa nội dung để đổi đường dẫn).
- Không đụng: `contracts/`, `openspec/specs/**`, mã nghiệp vụ của frontend.
