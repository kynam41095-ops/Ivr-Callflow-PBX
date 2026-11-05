# Design

## Context

Xem `proposal.md` — Why. Hiện trạng đo trên máy này ngày 2026-11-05:

- Repo chỉ có `services/frontend` (React 19 + Vite 8 + Vitest 5 + Playwright 1.63, TypeScript
  `~6.0.3`). `npm test` trong profile `test` xanh: **64 unit + 81 e2e**.
- `compose.yaml` có hai service `frontend` (nginx, cổng 8080) và `frontend-test` (profile `test`,
  image Playwright, mount cả repo). Không có database, Redis, xác thực hay đa tenant nào.
- Gốc repo **không** có `package.json`: không tồn tại `npm run smoke`, `npm run build`,
  `npm run test:integration`, `npm run contracts:check`, `npm run test:e2e`. Entrypoint thật là
  script trong `package.json` của frontend (nay ở `services/frontend/package.json`, sau change là
  `apps/frontend/package.json`: `dev`, `test`, `typecheck`, `build`, `lint`) chạy qua container.
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

**Về chữ "LTS" trong yêu cầu:** NestJS **không** công bố nhãn LTS cho các bản major (không có
mục LTS trong release notes hay docs; chữ LTS duy nhất trong release v12 nói về Node.js LTS).
Vì vậy "LTS mới nhất" được hiểu là **dòng major ổn định hiện hành**: 12.x — major 12.0.0 ra
2026-08-27, bản vá mới nhất `12.3.3` công bố 2026-11-04 (một ngày trước lúc viết). Dòng 11.x vẫn
được vá song song (11.2.8, 2026-10-23) nếu muốn thận trọng hơn; xem Risks.

## Goals / Non-Goals

**Goals:**

- Một layout `apps/frontend` + `apps/backend`, không còn `services/`.
- Backend NestJS bản ổn định mới nhất, TypeScript phiên bản cao nhất mà bộ tool của Nest còn chạy.
- Cả hai app build bằng Dockerfile riêng, chung `compose.yaml`.
- Frontend giữ nguyên 64 unit + 81 e2e xanh sau khi đổi đường dẫn.

**Non-Goals:**

- **Không có việc nào liên quan contract trong change này**: `contracts/` giữ nguyên tại gốc repo,
  không di chuyển, không sửa, không thêm endpoint nào theo contract. Người đặt việc đã nói rõ chỉ
  cần đổi cấu trúc repo và khởi tạo backend trước.
- Không viết nghiệp vụ phía máy chủ (đầu số, kịch bản, phiên bản, media). Backend chỉ là khung.
- Không thêm PostgreSQL, Redis, hàng đợi hay xác thực.
- Không nối frontend sang gọi HTTP thật; `src/data/api.ts` vẫn là kho giả lập.
- Không đổi `openspec/specs/**` (tám capability hiện có giữ nguyên yêu cầu).
- Không dựng CI GitHub Actions trong change này.

## Acceptance criteria và cách kiểm

Mỗi tiêu chí dưới đây là một quan sát được, không phải một lần chạy suite. `S1`–`S4` là scenario
trong `specs/service-health/spec.md`; `AC-*` là tiêu chí cấu trúc của chính change này lấy từ
`proposal.md`.

| # | Tiêu chí (nguồn) | Điều kiện trước | Đầu vào / hành động | Kết quả mong đợi | Bằng chứng |
|---|---|---|---|---|---|
| S1 | Cổng mặc định khi không có `PORT` (`service-health` R1) | Image backend đã build; biến `PORT` **không được đặt** trong môi trường | `docker run --rm -p 3001:3000 ivr-backend` (**không** truyền `-e PORT`), rồi `curl -fsS http://127.0.0.1:3001/health` | Dịch vụ lắng nghe `3000` trong container; `curl` trả `200` JSON `{"status":"ok"}` | mã thoát `curl` = 0 + thân phản hồi; log `Nest application successfully started` |
| S2 | Cổng theo `PORT` khác (`service-health` R1) | Image backend đã build | `docker run --rm -e PORT=4010 -p 4010:4010 ivr-backend`, `curl http://127.0.0.1:4010/health`, `curl http://127.0.0.1:3000/health` | `curl` cổng `4010` = `200`; `curl` cổng `3000` **thất bại** (`curl` mã thoát ≠ 0, không kết nối được) | hai mã thoát `curl` khác nhau, không suy đoán |
| S3 | `GET /health` trả sẵn sàng (`service-health` R3) | Dịch vụ đã khởi động xong (chờ log `successfully started`, không `sleep` mù) | `curl -i http://127.0.0.1:<cổng>/health` | Dòng trạng thái `200`; thân JSON parse được, `status` = `"ok"`; không cần header xác thực | `curl -i` đầy đủ + `jq -e '.status=="ok"'` mã thoát 0 |
| S4 | Đường dẫn chưa khai báo (`service-health` R3) | Dịch vụ đã khởi động xong | `curl -o /dev/null -s -w '%{http_code}' http://127.0.0.1:<cổng>/khong-ton-tai` | In ra `404` | giá trị in ra đúng `404` |
| S5 | `PORT` không hợp lệ → dừng (`service-health` R2) | Image backend đã build | Ba lần chạy riêng: `-e PORT=`, `-e PORT=abc`, `-e PORT=70000`, mỗi lần `docker run --rm` | Mỗi lần: mã thoát ≠ `0`; **không** cổng TCP nào mở; với `PORT=abc` **không** sinh Unix socket tên `abc` | ba mã thoát ≠ 0; `docker run` không in `successfully started`; `ls` trong workdir không có file `abc` |
| AC-1 | Layout mới, không còn `services/` (`proposal.md` What Changes) | Working tree sạch ở nhánh ticket | `git mv services/frontend apps/frontend`; `test -f apps/frontend/package.json`; `test ! -d services` | Cả hai lệnh `test` thoát 0; `git status` ghi nhận rename (`R`), không phải `D`+`A` hàng loạt | đầu ra `git status --short` bắt đầu bằng `R` cho các file đã đổi tên |
| AC-2 | Frontend không hồi quy sau khi đổi đường dẫn (Goals) | `apps/frontend` đã ở vị trí mới; chưa sửa gì thêm | `docker compose --profile test run --rm frontend-test npm test` | **64 unit + 81 e2e** xanh, giống baseline đo hôm nay | log có `64 passed` và `81 passed`; mã thoát 0 |
| AC-3 | Frontend build được ở đường dẫn mới | `apps/frontend` đã ở vị trí mới | `docker compose build frontend` | Build thành công; image phục vụ được trang chủ | mã thoát 0; `curl -fsS http://127.0.0.1:8080/` chứa `id="root"` |
| AC-4 | Backend khởi tạo đúng khung modular monolith (`proposal.md` What Changes) | Repo đã có `apps/` | Tạo `apps/backend` rồi đọc cây `src/` | Có `main.ts`, `app.module.ts`, `src/modules/health/`; **không** có `.git` trong `apps/backend`; `@nestjs/*` ghim cứng version | `find apps -name .git` rỗng; `grep -c '"@nestjs/common": "\^'` = 0 |
| AC-5 | Backend test xanh trong container (Goals) | `apps/backend` có source + test; image test dựng được | `docker compose --profile test run --rm backend-test npm test` | Unit test của health controller và e2e test `GET /health` đều xanh | log `Test Files … passed`, mã thoát 0 |
| AC-6 | Backend đóng gói và chạy được (`proposal.md` What Changes — Dockerfile + compose) | `apps/backend/Dockerfile` có | `docker build -f apps/backend/Dockerfile -t ivr-backend .`; `docker compose up -d backend`; `curl` health | Build exit 0; `curl /health` trả `{"status":"ok"}`; **sau đó** `docker compose down` | ba mã thoát 0 + thân phản hồi; `docker compose ps` không còn service sót |
| AC-7 | Tài liệu không còn đường dẫn cũ (`AGENTS.md` kiểm trước khi báo xong) | Mọi file đã sửa xong | `grep -rn "services/" --include=*.md --include=*.ts --include=*.json --include=*.yaml --include=Dockerfile .` | Chỉ còn kết quả trong `openspec/changes/**` (lịch sử) | danh sách đường dẫn khớp, không có file mã nguồn |

Ghi chú về role/tenant: repo **không** có xác thực, không có tenant, người dùng luôn là ẩn danh —
nên cột "role/tenant" ở trên đồng nhất là "không áp dụng"; bất kỳ yêu cầu phân quyền nào cũng nằm
ngoài change này. Đường dẫn lỗi (`S4`) là failure path duy nhất mà khung hiện có.

## Giá trị mặc định và thứ tự ưu tiên của `PORT`

Rule `specs` yêu cầu chốt giá trị và thứ tự ưu tiên ở chỗ hành vi phụ thuộc vào chúng. `PORT` là
chỗ duy nhất như vậy, và nó **không** hiển nhiên — đo trên máy này ngày 2026-11-05 bằng
`node:net` và bằng chính app `nest new`:

| `PORT` | `process.env.PORT ?? 3000` | Hành vi thật của Node/Nest | Kết luận |
|---|---|---|---|
| không đặt | `3000` (số) | listen TCP `3000` | đúng ý |
| `""` (chuỗi rỗng) | `""` | **ném `ERR_SOCKET_BAD_PORT`** khi listen | phải chết, không được lặng lẽ dùng 3000 |
| `"   "` | `"   "` | không phải số → rơi vào nhánh "không phải số" | phải chết |
| `"abc"` | `"abc"` | **tạo Unix socket tên `abc`** và "khởi động thành công", TCP **không** mở | nguy hiểm nhất — phải chặn |
| `"70000"` | `"70000"` | ngoài khoảng cổng hợp lệ | phải chết |

Bằng chứng cho dòng `"abc"`: chạy `PORT=abc node dist/main.js` trong thư mục trống, log ghi
`Nest application successfully started`, nhưng `curl http://127.0.0.1:3000/health` trả mã thoát
`7` (không kết nối được) và trong thư mục xuất hiện file `srwx------ abc` — đó là Unix domain
socket, không phải cổng TCP. Nghĩa là **`process.env.PORT ?? 3000` một mình là không đủ**: một
biến môi trường gõ sai làm dịch vụ báo "đã khởi động" mà không phục vụ HTTP, và health check của
nơi vận hành sẽ thấy container "healthy" nhưng không ai gọi vào được.

**Quyết định:** `main.ts` đọc `PORT`, và nếu biến có mặt thì **bắt buộc** là số nguyên trong
khoảng `1`–`65535`; nếu không, in một dòng lỗi rõ ràng và thoát với mã khác `0` (không mở socket
nào). Chỉ khi biến **không đặt** mới dùng `3000`. Đây là hành vi được ràng buộc bởi requirement
"PORT không hợp lệ làm dịch vụ dừng" trong `specs/service-health/spec.md` (3 scenario: rỗng, không
phải số, ngoài khoảng).

**Bẫy khi kiểm, đừng mắc lại:** `docker run -e PORT=` đặt biến thành **chuỗi rỗng**, không phải
"không đặt" — nên S1 (trường hợp mặc định) phải chạy container **không** truyền `-e PORT`; còn
`-e PORT=` chính là một ca của requirement "PORT không hợp lệ". Không được nới spec để che việc
gọi lệnh sai.

## Decisions

**1. TypeScript 6.0.x cho backend — đúng nhánh "nếu Nest chưa hỗ trợ TS 7 thì hạ xuống 6".**

Frontend vốn đã ở `typescript: ~6.0.3` nên không phải đổi; chỉ backend phải chọn phiên bản, và
chọn 6 thay vì 7.

Đo được, không suy đoán: cài `@nestjs/cli@12.0.11` rồi `npx nest build` với `typescript@7.0.2`
cho đúng một lỗi, nguyên văn từ `node_modules/@nestjs/cli/lib/ui/errors.js`:

> The installed TypeScript version (7.0.2) does not expose the programmatic compiler API that the
> Nest CLI requires. TypeScript 7.0 ships the "tsc" executable only; the compiler API is expected
> to return in 7.1. Please install TypeScript 6 (e.g. "npm i -D typescript@^6") until then.

Kiểm chứng bổ sung: `Object.keys(require("typescript"))` trên TS 7.0.2 chỉ có `version` và
`getExePath`; `exports` chỉ mở `./unstable/*`. Thử trên chính app `nest new` (ESM, `"type":
"module"`) sau khi nâng lên TS 7.0.2: `npx nest build` thoát mã **1** với đúng thông báo trên,
nhưng `npx tsc -p tsconfig.build.json` biên dịch sạch, `node dist/main.js` khởi động và `curl /`
trả `Hello World!` (thử cả app CommonJS tối giản: như nhau). Nghĩa là **chỉ CLI của Nest** vướng,
không phải runtime, và TS 7 không hỏng decorator metadata. Vẫn chọn TS 6 thay vì bỏ `nest build`:
giữ được công cụ chuẩn của framework (`nest build`, `nest start --watch`, `nest generate`) thay vì
tự viết script `tsc` quanh nó để lách một chặn đã biết là tạm thời.

Hệ quả kéo theo:

- Backend **không** dùng `typescript-eslint`: scaffold `nest new` 12 sinh `oxlint` +
  `oxlint-tsgolint` và script `oxlint --type-aware src/ test/`. Đã chạy thử trên scaffold với
  `typescript@6.0.3`: `Found 0 warnings and 0 errors.` (oxlint 1.91.0, 111 rules) — hoạt động.
  Frontend vẫn giữ `typescript-eslint` 8.72.1 (peer `typescript >=4.8.4 <6.1.0`, khớp TS 6.0.x vì
  thế **không** được nâng frontend lên TS 7).
- `ts-jest` khai peer `typescript >=4.3 <7` → TS 6 cũng là bản cao nhất còn dùng được. Không dùng
  ts-jest: khung Nest 12 dùng **Vitest** (xem quyết định 4).

**2. Layout `apps/<tên-app>/`, chuyển bằng `git mv`.**

Yêu cầu của người đặt việc ghi rõ `apps/frontend`, `apps/backend`. `git mv services/frontend
apps/frontend` giữ lịch sử từng file (git nhận diện rename) và giữ một `.git` duy nhất ở gốc.
Không copy-rồi-xoá: cách đó làm mất blame.

`apps/frontend/src` cách gốc repo đúng **ba** cấp, bằng `services/frontend/src` trước đây, nên mọi
đường dẫn tương đối tính theo độ sâu đó (`src/contracts.ts`, `vite.config.ts` với
`fs.allow: ["../.."]`, hai chỗ tính `repoRoot` trong e2e) **không phải sửa giá trị nào**. Đây là
lý do chọn `apps/` thay vì lồng thêm cấp: độ sâu không đổi thì bán kính ảnh hưởng của việc đổi
layout nhỏ nhất, và AC-2 dùng lại được nguyên baseline.

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
thật, nên AC-5 không cần cấp cổng và không thể đụng cổng của ai khác.

**5. TypeScript 6 + ESM theo scaffold, không dùng `tsc` trần.**

Người đặt việc đã chốt **ESM** (mục Open Questions). Dùng `tsconfig.json` của scaffold
(`module`/`moduleResolution: nodenext`, `emitDecoratorMetadata`, `experimentalDecorators`,
`strict`, `outDir`, `rootDir`) + `tsconfig.build.json` loại test; `package.json` có
`"type": "module"` nên import nội bộ ghi đuôi `.js`. Đây là mặc định của `nest new` 12 nên không
phải chỉnh tay gì thêm.

Đã đo nhánh còn lại để so: bỏ `"type": "module"` sang CommonJS **vẫn build + chạy được**
(`nest build` thoát 0, `dist/main.js` dùng `require()`, `curl` trả `Hello World!`), nhưng phải sửa
thêm ba chỗ — `await bootstrap()` top-level phải thành `void bootstrap()` (TS1378), import nội bộ
bỏ đuôi `.js`, và `moduleResolution: node` không dùng được (TS5098 + TS5107). Chọn ESM vì rẻ hơn
và đúng mặc định framework.

**6. Container hoá: `apps/backend/Dockerfile` multi-stage, context = gốc repo.**

Giống frontend: `node:24-bookworm-slim` build → image runtime gọn chỉ chạy `node dist/main.js`.
Context là gốc repo để nhất quán với frontend, không phải để đọc contract (Non-Goals).

Hai biến cho hai việc khác nhau, không lẫn: **`PORT`** là cổng tiến trình lắng nghe bên trong
container (`service-health` kiểm đúng biến này, S1/S2); **`BACKEND_PORT`** là cổng công bố trên
máy host, dùng trong `compose.yaml` (`"${BACKEND_PORT:-3000}:3000"`), để không đụng cổng khác
trên máy dev. Container luôn chạy với `PORT=3000` trừ khi ai đó cố ý đổi.

**7. Compose: thêm `backend` và `backend-test`; đổi `frontend-test` sang đường dẫn mới.**

`frontend-test` hiện mount `${REPO_DIR:-.}` nguyên repo nên chỉ cần đổi `working_dir` và tên
volume. `backend-test` dùng `node:24-bookworm-slim` (không cần Chromium) với `npm test`.

**8. Tài liệu và ngữ nghĩa "service" đi theo layout.**

`README.md`, `AGENTS.md`, `apps/frontend/README.md`, `apps/frontend/Dockerfile` và
`apps/frontend/src/contracts.ts` (comment) đều nhắc `services/`. Đổi hết sang `apps/`. `AGENTS.md`
thêm một mục ngắn về quy ước module backend (một miền = một module dưới `src/modules/`) và ghim
TypeScript 6 kèm lý do, để lần sau không ai nâng TS 7 rồi vỡ `nest build` mà không biết vì sao.

`openspec/config.yaml` là ngoại lệ: nó đã được **ghi đè nguyên văn** bằng file người đặt việc gửi,
nên **không** sửa để "đổi `services/` thành `apps/`". File đó không có key `context`; bốn ràng buộc
từng nằm ở `context` (một `.git` ở gốc, contract một bản ở `contracts/`, build bằng Dockerfile với
context là gốc repo, nội dung tiếng Việt) hiện được giữ ở `AGENTS.md`, nên không mất thông tin.
Việc này đã kiểm: cả bốn câu đều có trong `AGENTS.md`.

## Cơ sở quan sát được và những gì sẽ tái dùng

Rule `design` mục 4 yêu cầu nền tảng phải là **cái đã kiểm tra thật**, tách "quan sát được" khỏi
"đề xuất", và ghi rõ API/quy ước tái dùng, biên bị ảnh hưởng, dependency. Mọi dòng dưới đây đọc
trực tiếp trong working tree hôm nay.

**Quan sát được (đã có trong mã, không phải đề xuất):**

| Thứ | Vị trí | Dùng để |
|---|---|---|
| Quy ước "một chỗ biết đường dẫn contract" | `services/frontend/src/contracts.ts` | giữ nguyên cách làm khi đổi layout: không sửa giá trị đường dẫn, chỉ sửa comment |
| Kiểu test + cách chạy | `services/frontend/package.json` (`test` = `vitest run && playwright test --pass-with-no-tests`) | AC-2 dùng lại đúng entrypoint này, không thêm script |
| Playwright tự dựng dev server | `services/frontend/playwright.config.ts` (`webServer`, `reuseExistingServer: !process.env.CI`) | không dựng server thứ hai khi chạy browser acceptance |
| Cách kiểm môi trường sạch của e2e | `e2e/canvas-native.spec.ts` đọc `package.json` qua `frontendRoot` | xác nhận đổi layout không làm đổi cách tính đường dẫn |
| Kho dữ liệu giả lập + ép lỗi | `src/data/api.ts`, `src/data/mock.ts`, query `?mockFail=` | cô lập fixture, không cần dọn dẹp |
| Build bằng Dockerfile, context = gốc repo | `services/frontend/Dockerfile`, `compose.yaml` | khuôn mẫu để viết `apps/backend/Dockerfile` |
| Chặn TS 7 của Nest CLI | `node_modules/@nestjs/cli/lib/ui/errors.js` (bản cài thử) | căn cứ chọn TS 6 |

**API/quy ước tái dùng, không phát minh mới:** `npm test` của từng app là entrypoint duy nhất;
`docker compose --profile test run --rm <service>` là cách chạy; `PORT` là biến chuẩn của
container; `HealthModule` đặt dưới `src/modules/` đúng quy ước module mà `AGENTS.md` sẽ ghi.

**Biên bị ảnh hưởng:** đường dẫn `services/` → `apps/` (mã, doc, compose, Dockerfile); thêm một
tiến trình và một image; `openspec/config.yaml` bị ghi đè.

**Dependency thêm (chỉ trong `apps/backend/package.json`):** `@nestjs/{common,core,platform-express}`
12.3.3, `reflect-metadata` 0.2.x, `rxjs` 7.8.x; dev: `@nestjs/cli` 12.0.x, `@nestjs/testing` 12.3.3,
`typescript` ~6.0.3, `vitest` 4.x, `supertest` 7.x, `oxlint` + `oxlint-tsgolint`.

**Được đánh dấu là đề xuất (chưa tồn tại, apply sẽ tạo):** `apps/backend/**` nói chung;
`apps/backend/src/modules/health/**`; `apps/backend/src/main.ts` với hàm `resolvePort`;
`apps/backend/Dockerfile`; service `backend`/`backend-test` trong `compose.yaml`. Không đường dẫn
nào ở trên được viết như thể đã có.

**Không tái dùng được vì không tồn tại:** root `package.json`, `npm run smoke`, `npm run build`,
`npm run test:integration`, `npm run contracts:check`, `npm run test:e2e` (đã kiểm: không có file
nào khai các script này), PostgreSQL, Redis, xác thực, tenant, cơ chế locale.

## Phân loại quyết định (settled / apply tự chọn / cần người duyệt)

Rule `design` mục 5 yêu cầu tách ba loại này và giải quyết câu hỏi ảnh hưởng phạm vi, hành vi, dữ
liệu hay tương thích **trước khi** coi phần phụ thuộc là sẵn sàng.

**Đã chốt, apply không được đổi:**

- Layout `apps/frontend` + `apps/backend`, `git mv`, một `.git` ở gốc.
- NestJS 12.3.x; TypeScript 6.0.x; **ESM** (`"type": "module"`, import đuôi `.js`).
- Backend là modular monolith: `AppModule` + `src/modules/<domain>/`.
- Test backend bằng Vitest + supertest; lint bằng `oxlint`/`oxlint-tsgolint` (theo scaffold).
- `PORT` không hợp lệ → thoát mã ≠ 0, không mở socket (requirement R2 của spec).
- Không có việc nào liên quan contract; không thêm `package.json` gốc; không CI.

**Apply tự chọn (không cần hỏi lại, miễn giữ hành vi đã chốt):**

- Tên hàm nội bộ (`resolvePort`), cách tách file trong `src/modules/health/`, tên biến, có dùng
  `Logger` hay `console.error` cho dòng lỗi `PORT`.
- Cách viết test: `supertest` trực tiếp hay qua helper; số ca biên thêm cho `resolvePort`.
- Cách viết Dockerfile (số stage, có `npm ci --omit=dev` hay không) miễn image chạy `node dist/main.js`.
- Thứ tự sửa các file tài liệu, nội dung câu chữ tiếng Việt (giữ đúng nghĩa đã chốt).

**Cần người đặt việc duyệt trước khi coi là sẵn sàng:**

- Đổi bất kỳ mục "Đã chốt" ở trên.
- Thêm bất kỳ nghiệp vụ nào vào backend.
- Thêm hạ tầng (PostgreSQL/Redis/xác thực/tenant) hoặc thêm `package.json` gốc.

**Câu hỏi ảnh hưởng phạm vi/hành vi/dữ liệu/tương thích còn mở:** không còn. ESM đã được người
đặt việc chốt; ba mục còn mở (nghiệp vụ đầu tiên, CI, có cần `package.json` gốc hay không) đều nằm
ngoài phạm vi change nên không chặn cài đặt. Không mục nào ở đây dựa vào lịch sử chat: mọi quyết
định đã chốt đều ghi trong file này.

## Test entrypoints, readiness và cô lập trạng thái

**Working directory:** mọi lệnh chạy từ **gốc repo** (nơi có `compose.yaml`). Không `cd` vào
`apps/*` để chạy `docker compose`, vì biến `REPO_DIR` và mount của profile `test` tính theo gốc.

**Entrypoint (đã kiểm là tồn tại, không phải giả định):**

| Việc | Lệnh | Ghi chú |
|---|---|---|
| Unit + e2e frontend | `docker compose --profile test run --rm frontend-test npm test` | `npm test` = `vitest run && playwright test --pass-with-no-tests` |
| Chỉ Playwright, có tham số | `docker compose --profile test run --rm frontend-test npx playwright test <file> --reporter=line` | Truyền tham số sau `--` nếu qua `npm test`; không `cd` vào `apps/frontend/e2e` để chạy |
| Typecheck / lint / build frontend | `… frontend-test npm run typecheck` / `npm run lint` / `npm run build` | dùng khi sửa `apps/frontend` |
| Test backend | `docker compose --profile test run --rm backend-test npm test` | Vitest unit + e2e trong một lần |
| Build image | `docker compose build frontend backend` | hoặc `docker build -f apps/<app>/Dockerfile -t ivr-<app> .` |

**Service readiness:** `apps/frontend/playwright.config.ts` đã có `webServer` (`npm run dev --
--port 5173 --strictPort`, `port: 5173`, `reuseExistingServer: !process.env.CI`) nên Playwright tự
dựng dev server; **không** dựng server thứ hai và không chạy server dài hạn trong một lệnh shell
hữu hạn. Với backend, chờ log `Nest application successfully started` rồi mới `curl`, thay vì
`sleep` một con số đoán được. Nếu một cổng đang bị chiếm, đó là **blocker môi trường**, không phải
lỗi ứng dụng: kiểm `ss -ltnp` và dùng cổng khác qua biến, không `kill` tiến trình lạ.

**Playwright:** bản `1.63.0`, khớp tag image `mcr.microsoft.com/playwright:v1.63.0-noble`. Môi
trường container **không có GUI**, nên chỉ chạy được **headless** — điều này phải ghi trong
apply-report thay vì ngầm hiểu là "headed".

**Cô lập fixture:** bộ e2e hiện tại chạy trên kho giả lập trong bộ nhớ (`src/data/mock.ts`), mỗi
lần tải trang là một kho mới; lỗi được ép bằng query `?mockFail=<tên hàm>` (xem
`src/data/api.ts`). Không test nào ghi ra đĩa. Vì vậy change này **không** cần dọn dẹp gì giữa các
test và cũng không được phép dọn dẹp gì.

**Những thứ không áp dụng — kèm bằng chứng, không phải bỏ qua:**

- **Redis / rate-limit bucket:** không có. `compose.yaml` chỉ khai `frontend` và `frontend-test`;
  `package.json` của frontend (đo ở `services/frontend/package.json` hôm nay, sẽ là
  `apps/frontend/package.json`) không có dependency Redis; không có middleware rate-limit trong
  `src/`. Không có bucket nào để tính hay xoá.
- **RLS context:** không có database, nên không có row-level security. "Zero row" không được dùng
  làm bằng chứng cho bất cứ điều gì trong change này.
- **Role/tenant:** không có xác thực và không có khái niệm tenant trong mã; mọi yêu cầu HTTP tới
  backend là ẩn danh. Không có fixture role/tenant để chuẩn bị.
- **Locale:** giao diện chỉ có tiếng Việt, không có cơ chế đổi locale; Playwright dùng device
  `Desktop Chrome` mặc định và không override `locale`. Trường `timezone` trong inspector là dữ
  liệu nghiệp vụ của node "Điều kiện theo lịch", không phải locale của môi trường test.
- **Thiết lập/dọn dẹp phá huỷ:** không được cấp phép. Change này không được `docker volume rm`,
  không `docker compose down -v`, không xoá `test-results/` của lượt chạy khác.

## Browser acceptance (Playwright)

Change này **không** thêm hay đổi hành vi giao diện, nên không có scenario Playwright mới. Phần
browser acceptance ở đây là **hồi quy trên giao diện thật**, chạy bằng Chromium thật trong image
Playwright, sau khi đường dẫn đổi:

- **Scenario B1 — giao diện còn dựng đúng ở layout mới:** mở `/`, chờ canvas IVR xuất hiện; kiểm
  các phần tử gốc (`#root` trong `index.html`, palette, `.react-flow__node`) hiện diện. Nguồn: các
  spec e2e hiện có (`tokens`, `chrome-visual`, `builder-palette`).
- **Scenario B2 — hành vi sau khi tải lại vẫn đúng như đã chốt:** `e2e/reload.spec.ts`
  (TC-FLOW-025) tạo đầu số + lưu bản nháp, `page.reload()`, rồi assert trạng thái **về đúng gốc**
  (kho giả lập trong bộ nhớ). Quy tắc design nói "persistence after reload"; ở change này hành vi
  đúng là **reset**, không phải persist — nên scenario kiểm đúng chiều đó và **không** được viết
  lại thành assert persistence, vì làm vậy là đổi hành vi đã có chứ không phải hồi quy.
- **Scenario B3 — đường dẫn lỗi ở tầng giao diện:** `e2e/error-states.spec.ts` + cơ chế
  `?mockFail=` kiểm `[role="alert"]` và `button[data-testid="retry"]`. Không đổi trong change này,
  nhưng là failure path đang có và phải còn xanh.

Ba scenario trên chạy bằng **thao tác và assert UI thật** (`page.goto`, `click`, `dragTo`,
`expect(locator)`), không thay bằng kiểm API. Bằng chứng cần giữ: log Vitest/Playwright (gồm
`81 passed`), ảnh `test-results/tc-flow-034/{numbers,builder,drawer}.png` do
`e2e/chrome-visual.spec.ts` sinh ra, phiên bản Playwright, và câu "headless vì container không có
GUI".

## Risks / Trade-offs

- **[Đổi layout làm hỏng nhánh remote còn sống]** → `agent/readme-agent-line-…` và
  `wip/gitlab-intake-scripts` còn commit riêng trên nền `services/`; `issue-1-…`/`issue-5-…` chỉ
  là con trỏ vào commit đã có trong `develop` nên không ảnh hưởng. Không rebase hộ; ghi rõ trong
  tasks là phải rebase sau khi merge, và change này không sửa nhánh của người khác.
- **[Nest 12 phát hành ESM, `"type": "module"`]** → import nội bộ phải ghi `.js`; quên là lỗi
  runtime `ERR_MODULE_NOT_FOUND`. Giảm thiểu: giữ nguyên quy ước scaffold sinh ra, và AC-4/AC-5
  boot thật `AppModule` nên lỗi này lộ ngay.
- **[Nest 12 mới ra ~2 tháng]** → còn ít kinh nghiệm vận hành so với 11.x. Nếu muốn thận trọng,
  chọn dòng 11.x trong lúc apply: cùng khung module, cùng CLI, chỉ khác major. Ghi rõ trong
  proposal nếu đổi để người duyệt thấy.
- **[TS 6 là bản bị chặn trên, TS 7.1 mới gỡ]** → khi Nest CLI hỗ trợ TS 7, nâng `typescript`
  của backend và `typescript` + `typescript-eslint` của frontend cùng lúc; ghi chú này vào
  `AGENTS.md`.
- **[Vitest 5 ở frontend, Vitest 4.x trong scaffold backend]** → hai app giữ version riêng vì
  mỗi app có `package.json` riêng; không gộp workspace lúc này (chưa có package dùng chung nào để
  chia sẻ). Rủi ro thấp vì test chạy trong từng image riêng.
- **[Thêm service `backend` vào compose khi mới có khung]** → image chạy nhưng không phục vụ
  nghiệp vụ nào ngoài `/health`. Chấp nhận: đó chính là mục tiêu "khung chạy được, kiểm được".

## Migration Plan

1. `git mv services/frontend apps/frontend`; xoá thư mục `services/` rỗng.
2. Sửa đường dẫn: `README.md`, `AGENTS.md`, `openspec/config.yaml`, `apps/frontend/Dockerfile`,
   `apps/frontend/README.md`, `compose.yaml`.
3. Chốt chặn đổi layout: AC-2 và AC-3 phải xanh **trước khi** động vào backend. Nếu đỏ, lỗi nằm ở
   việc đổi layout.
4. Dựng `apps/backend/` từ `nest new` (ESM, TS 6, Vitest), ghim version cụ thể, thêm
   `HealthModule`, `main.ts` đọc `PORT`.
5. Thêm `apps/backend/Dockerfile`, service `backend` + `backend-test` trong `compose.yaml`.
6. Cập nhật `README.md` gốc (bảng app, lệnh build/test) và `AGENTS.md`.
7. Nghiệm thu: AC-1…AC-7, ghi bảng coverage vào `apply-report.md`.

**Rollback:** `git revert` commit đổi layout; không có migration dữ liệu, không có thay đổi schema
nên revert là đủ. Trước khi merge, nhánh change này không đụng `origin/develop`.

## Open Questions

### Đã chốt

- **ESM — người đặt việc chốt ngày 2026-11-05**, đúng mặc định của `nest new` 12: backend dùng
  `"type": "module"`, import nội bộ ghi đuôi `.js`. Không còn là câu hỏi mở.
- **Nest 12.x**: lấy major ổn định hiện hành (12.3.3) vì Nest không gắn nhãn LTS cho major. Đổi
  sang 11.x chỉ là đổi số version, khung module và CLI không đổi.
- **Không thêm `package.json` ở gốc repo** (không npm workspaces). Hệ quả phải biết: các lệnh
  `npm run smoke`, `npm run build`, `npm run test:integration`, `npm run contracts:check`,
  `npm run test:e2e` mà `operations.apply.guidance` nhắc tới **không tồn tại** ở repo này; design
  thay bằng lệnh `docker compose` tương đương ở mục "Test entrypoints".
- **`PORT` không hợp lệ phải làm dịch vụ dừng** (không lắng nghe sai chỗ) — chốt trong
  `specs/service-health/spec.md`, requirement "PORT không hợp lệ làm dịch vụ dừng", kèm ba
  scenario. Lý do là số đo ở mục "Giá trị mặc định và thứ tự ưu tiên" bên dưới.

### Còn mở, không chặn apply

- **Nghiệp vụ đầu tiên của backend là gì?** Chưa chốt, và **không** thuộc change này; sẽ là change
  riêng. Khung `HealthModule` cố ý không ám chỉ miền nào.
- **Có cần CI (GitHub Actions) cho hai app không?** Repo chưa có CI; nếu muốn, nên là change
  riêng để không trộn với việc đổi layout.

**Có thể bỏ nếu không muốn:** `HealthModule` + capability `service-health` là hành vi tối thiểu
để khung backend kiểm được. Không cần nó thì xoá module, xoá `specs/service-health/` và phần kiểm
tương ứng ở task 2.2–2.4; phần còn lại của change không đổi.
