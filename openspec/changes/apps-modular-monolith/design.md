# Design

## Context

Xem `proposal.md` — Why. Hiện trạng đo trên máy này ngày 2026-11-05:

- Repo chỉ có `services/frontend` (React 19 + Vite 8 + Vitest 5 + Playwright 1.63, TypeScript
  `~6.0.3`). `npm test` trong profile `test` xanh: **64 unit + 81 e2e**.
- `contracts/flow-document.schema.json` ở gốc repo; `services/frontend/src/contracts.ts` trỏ
  `"../../../contracts/flow-document.schema.json"` — đúng **ba** cấp từ `src/`.
- `compose.yaml` có hai service `frontend` (nginx, cổng 8080) và `frontend-test` (profile `test`,
  image Playwright, mount cả repo).
- Chưa có `.github/workflows`, chưa có CI nào khác.
- Hai nhánh remote còn commit riêng chưa vào `develop` (`agent/readme-agent-line-…`,
  `wip/gitlab-intake-scripts`) đều dựa trên layout `services/`; `issue-1-…` và `issue-5-…` chỉ là
  con trỏ cũ trỏ vào commit đã nằm trong `develop`.

Phiên bản đo trực tiếp bằng `npm view` và bằng cách cài thử trong `/tmp`:

| Gói | Bản ổn định mới nhất | Ghi chú |
|---|---|---|
| `@nestjs/core`, `common`, `platform-express` | `12.3.3` | Yêu cầu Node `>= 20` |
| `@nestjs/cli` | `12.0.11` | Ghim `typescript: ~6.0.2` trong dependency của chính nó |
| `typescript` | `7.0.2` | Chỉ phát hành `tsc` + API `unstable/*` |
| `vitest` | `5.1.0` | Khung Nest 12 sinh sẵn `vitest` 4.x; frontend đang dùng `^5.0.1` |

## Goals / Non-Goals

**Goals:**

- Một layout `apps/frontend` + `apps/backend`, không còn `services/`.
- Backend NestJS bản ổn định mới nhất, TypeScript phiên bản cao nhất mà bộ tool của Nest còn chạy.
- Cả hai app build bằng Dockerfile riêng, chung `compose.yaml`, chung `contracts/` ở gốc.
- Frontend giữ nguyên 64 unit + 81 e2e xanh sau khi đổi đường dẫn.

**Non-Goals:**

- Không viết nghiệp vụ phía máy chủ (đầu số, kịch bản, phiên bản, media) — endpoint nghiệp vụ
  đầu tiên cần contract HTTP thật, hiện chỉ có `contracts/flow-document.schema.json`.
- Không thêm PostgreSQL, Redis, hàng đợi hay xác thực.
- Không nối frontend sang gọi HTTP thật; `src/data/api.ts` vẫn là kho giả lập.
- Không đổi `openspec/specs/**` (tám capability hiện có giữ nguyên yêu cầu).
- Không dựng CI GitHub Actions trong change này (repo chưa có CI; thêm CI là việc riêng).

## Decisions

**1. TypeScript 6.0.x cho cả hai app — đúng nhánh "nếu Nest chưa hỗ trợ TS 7 thì hạ xuống 6".**

Đo được, không suy đoán: cài `@nestjs/cli@12.0.11` rồi `npx nest build` với `typescript@7.0.2`
cho đúng một lỗi, nguyên văn từ `node_modules/@nestjs/cli/lib/ui/errors.js`:

> The installed TypeScript version (7.0.2) does not expose the programmatic compiler API that the
> Nest CLI requires. TypeScript 7.0 ships the "tsc" executable only; the compiler API is expected
> to return in 7.1. Please install TypeScript 6 (e.g. "npm i -D typescript@^6") until then.

Kiểm chứng bổ sung: `Object.keys(require("typescript"))` trên TS 7.0.2 chỉ có `version` và
`getExePath`; `exports` chỉ mở `./unstable/*`. Trong khi đó `tsc -p tsconfig.build.json` vẫn biên
dịch và chạy được app Nest (emit `design:paramtypes` đúng), nghĩa là **chỉ CLI của Nest** vướng,
không phải runtime. Vẫn chọn TS 6 thay vì bỏ `nest build`: giữ được công cụ chuẩn của framework
(`nest build`, `nest start --watch`, `nest generate`) thay vì tự viết script `tsc` quanh nó để
lách một chặn đã biết là tạm thời.

Hệ quả kéo theo:

- `typescript-eslint` 8.72.1 khai peer `typescript >=4.8.4 <6.1.0` → khớp TS 6.0.x, **không** khớp
  TS 7. Vì vậy lint bằng `typescript-eslint` cho backend chỉ dùng được với TS 6.
- `ts-jest` khai peer `typescript >=4.3 <7` → TS 6 cũng là bản cao nhất còn dùng được. Không dùng
  ts-jest: khung Nest 12 dùng **Vitest** (xem quyết định 4).

**2. Layout `apps/<tên-app>/`, chuyển bằng `git mv`.**

Yêu cầu của người đặt việc ghi rõ `apps/frontend`, `apps/backend`. `git mv services/frontend
apps/frontend` giữ lịch sử từng file (git nhận diện rename) và giữ một `.git` duy nhất ở gốc.
Không copy-rồi-xoá: cách đó làm mất blame.

`apps/frontend/src` vẫn cách gốc repo **ba** cấp, đúng bằng `services/frontend/src` trước đây, nên
`src/contracts.ts`, `vite.config.ts` (`fs.allow: ["../.."]`) và hai chỗ tính `repoRoot` trong e2e
**không phải sửa một dòng nào**. Đây là lý do chọn `apps/` thay vì `packages/` hay lồng thêm cấp:
độ sâu không đổi thì bán kính ảnh hưởng của việc đổi layout nhỏ nhất.

**3. Backend là modular monolith: `AppModule` + `src/modules/<domain>/`.**

Yêu cầu là modular monolith, không phải microservice. Khung giữ một tiến trình, một image, nhiều
module; mỗi module tự khai `controller`/`service`/`module` của mình và `AppModule` chỉ `imports`.
Change này chỉ dựng **khung**: `HealthModule` là module thật duy nhất (để `service-health` kiểm
được). Chưa tạo `did/`, `flow/`, `version/` rỗng — thư mục rỗng không kiểm được gì và dễ tạo cảm
giác nghiệp vụ đã có.

**4. Test backend bằng Vitest, không Jest; test e2e bằng `supertest`.**

Khung `nest new` bản 12 sinh sẵn `vitest.config.ts` + `vitest.config.e2e.ts` và `npm test` =
`vitest run`. Giữ nguyên lựa chọn của framework: frontend đã dùng Vitest nên cả repo còn một
runner, và tránh `ts-jest` (peer `<7`). `supertest` cho phép test `GET /health` mà không mở cổng
thật.

**5. TypeScript 6 kéo theo tsconfig kiểu scaffold, không dùng `tsc` trần.**

Dùng `tsconfig.json` của scaffold (`module`/`moduleResolution: nodenext`, `emitDecoratorMetadata`,
`experimentalDecorators`, `strict`, `outDir`, `rootDir`) + `tsconfig.build.json` loại test. Dự án
ESM (`"type": "module"`) nên import nội bộ phải ghi đuôi `.js` — đúng như mã scaffold sinh ra.

**6. Container hoá: `apps/backend/Dockerfile` multi-stage, context = gốc repo.**

Giống frontend: `node:24-bookworm-slim` build → image runtime gọn chỉ chạy `node dist/main.js`.
Context là gốc repo để nhất quán với frontend và để sẵn đường cho việc backend import `contracts/`
sau này. Cổng công bố đặt qua biến `BACKEND_PORT` (mặc định `3000`), không hard-code, để không
đụng cổng khác trên máy dev.

**7. Compose: thêm `backend` và `backend-test`; đổi `frontend-test` sang đường dẫn mới.**

`frontend-test` hiện mount `${REPO_DIR:-.}` nguyên repo nên chỉ cần đổi `working_dir` và tên
volume. `backend-test` dùng `node:24-bookworm-slim` (không cần Chromium) với `npm test`.

**8. Tài liệu và ngữ nghĩa "service" đi theo layout.**

`README.md`, `AGENTS.md`, `openspec/config.yaml`, `apps/frontend/README.md`,
`apps/frontend/Dockerfile` đều nhắc `services/`. Đổi hết sang `apps/`. `AGENTS.md` thêm một mục
ngắn về quy ước module backend (một miền = một module dưới `src/modules/`) và ghim TypeScript 6
kèm lý do, để lần sau không ai nâng TS 7 rồi vỡ `nest build` mà không biết vì sao.

## Risks / Trade-offs

- **[Đổi layout làm hỏng nhánh remote còn sống]** → `agent/readme-agent-line-…` và
  `wip/gitlab-intake-scripts` còn commit riêng trên nền `services/`; `issue-1-…`/`issue-5-…` chỉ
  là con trỏ vào commit đã có trong `develop` nên không ảnh hưởng. Không rebase hộ; ghi rõ trong
  tasks là phải rebase sau khi merge, và change này không sửa nhánh của người khác.
- **[Nest 12 phát hành ESM, `"type": "module"`]** → import nội bộ phải ghi `.js`; quên là lỗi
  runtime `ERR_MODULE_NOT_FOUND`. Giảm thiểu: giữ nguyên quy ước scaffold sinh ra, test e2e bắt
  được vì nó boot thật `AppModule`.
- **[TS 6 là bản bị chặn trên, TS 7.1 mới gỡ]** → khi Nest CLI hỗ trợ TS 7, nâng cả
  `typescript` lẫn `typescript-eslint` cùng lúc; ghi chú này vào `AGENTS.md`.
- **[Vitest 5 ở frontend, Vitest 4.x trong scaffold backend]** → hai app giữ version riêng vì
  mỗi app có `package.json` riêng; không gộp workspace lúc này (chưa có package dùng chung nào để
  chia sẻ). Rủi ro thấp vì test chạy trong từng image riêng.
- **[Image backend không mang `contracts/`]** → hiện chưa cần; khi backend đọc contract thì
  Dockerfile `COPY contracts contracts` như frontend đang làm.
- **[Thêm service `backend` vào compose khi mới có khung]** → image chạy nhưng không phục vụ
  nghiệp vụ nào ngoài `/health`. Chấp nhận: đó chính là mục tiêu "khung chạy được, kiểm được".

## Migration Plan

1. `git mv services/frontend apps/frontend`; xoá thư mục `services/` rỗng.
2. Sửa đường dẫn: `README.md`, `AGENTS.md`, `openspec/config.yaml`, `apps/frontend/Dockerfile`,
   `apps/frontend/README.md`, `compose.yaml`.
3. Kiểm frontend trước khi động vào backend: `docker compose --profile test run --rm frontend-test
   npm test` phải xanh 64 + 81 như baseline, `docker compose build frontend` phải thành công. Đây
   là chốt chặn: nếu bước này đỏ thì lỗi nằm ở việc đổi layout, chưa liên quan backend.
4. Dựng `apps/backend/` từ `nest new` (ESM, TS 6, Vitest), ghim version cụ thể, thêm
   `HealthModule`, `main.ts` đọc `PORT`.
5. Thêm `apps/backend/Dockerfile`, service `backend` + `backend-test` trong `compose.yaml`.
6. Cập nhật `README.md` gốc (bảng app, lệnh build/test) và `AGENTS.md`.
7. Nghiệm thu: test frontend xanh, `npm test` backend xanh, `docker compose build frontend
   backend` thành công, `curl localhost:3000/health` trả `{"status":"ok"}` từ container.

**Rollback:** `git revert` commit đổi layout; không có migration dữ liệu, không có thay đổi schema
nên revert là đủ. Trước khi merge, nhánh change này không đụng `origin/develop`.

## Open Questions

- **Nghiệp vụ đầu tiên của backend là gì?** Chưa có contract HTTP nào ngoài
  `contracts/flow-document.schema.json`. `src/data/api.ts` chỉ **nhắc tên** vài endpoint trong
  comment (`GET /flows/{flowId}/versions/{versionId}`, `POST /flows/{flowId}/versions`,
  `POST /flows`, `GET /media`, `GET /resources/queues`, `POST /admin/dids`) và trỏ tới
  `builder-api.yaml`, nhưng file đó **không có trong repo**. Change này cố ý dừng ở khung; cần
  người đặt việc chốt miền nghiệp vụ nào làm trước và cung cấp contract tương ứng, thay vì tự
  đoán hình dạng API.
- **Frontend có chuyển sang gọi backend thật trong đợt này không?** Mặc định là **không** (giữ kho
  giả lập), vì đổi `api.ts` sang HTTP là thay đổi hành vi của tám capability đang có và cần
  contract thật.
- **Có cần CI (GitHub Actions) cho hai app không?** Repo chưa có CI; nếu muốn, nên là change
  riêng để không trộn với việc đổi layout.
