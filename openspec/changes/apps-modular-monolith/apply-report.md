# Apply Report — `apps-modular-monolith`

Báo cáo của **bước apply**. Người thực hiện: agent apply, ngày 2026-11-05 (giờ máy
`Asia/Bangkok`). Mọi số liệu dưới đây lấy từ lần chạy thật trong worktree này; log đầy đủ ở
`test-results/` (không commit — nằm trong `.gitignore`).

**Môi trường đo:** Docker 29.1.3, Compose v5.6.1, Node trên máy v24.22.1 (chỉ dùng để đọc file,
không dùng để chạy app). **Mọi lệnh kiểm chạy trong container**, từ gốc repo.

**Compose project cô lập:** các lệnh `up`/`down` dùng `-p apps-nestjs-apply` để không đụng
container `ivr-callflow-pbx-frontend-1` (cổng 8080) của worktree khác. Lệnh
`--profile test ... run --rm` không để lại container nên giữ nguyên. Cổng 8080 bị chiếm, nên
khi kiểm frontend đã dựng dùng `FRONTEND_PORT=18080`; backend dùng `BACKEND_PORT=3020`.

## Bảng coverage

Trạng thái dùng đúng bốn giá trị của `operations.apply.guidance`: `not implemented`,
`implemented`, `verified`, `blocked`. Không có dòng nào để trống.

### Scenario trong `specs/service-health/spec.md`

| # | Tiêu chí (nguồn) | Task cài đặt | Kịch bản kiểm | Trạng thái | Bằng chứng (lệnh + kết quả thật) |
|---|---|---|---|---|---|
| S1 | Cổng mặc định khi không có `PORT` (R1) | 2.3 | `docker run --rm --name s1probe -p 3001:3000 ivr-backend` (**không** `-e PORT`) → chờ log `Nest application successfully started` → `curl http://127.0.0.1:3001/health` | **verified** | log: `Nest application successfully started` + `[Bootstrap] Biến PORT không được đặt, dùng cổng mặc định 3000`; body `{"status":"ok"}`, `HTTP=200`, `curl-exit=0`. Trong image `PORT` là **UNSET** (`docker run --rm ivr-backend sh -c 'echo ${PORT-UNSET}'` → `UNSET`) nên đúng là nhánh "không đặt". |
| S2 | `PORT` là số hợp lệ (R1) | 2.3 | `docker run --rm -e PORT=4010 -p 4010:4010 ivr-backend`; `curl :4010/health`; `curl :3000/health` | **verified** | log `[Bootstrap] Lắng nghe trên cổng 4010 theo biến PORT`; `curl :4010` → `{"status":"ok"}`, `HTTP=200`, exit **0**; `curl :3000` → `HTTP=000`, exit **7** (`Failed to connect to 127.0.0.1 port 3000`). Hai mã thoát khác nhau, không suy đoán. |
| S3 | `GET /health` trả sẵn sàng (R3) | 2.2 + 2.3 | `curl -i http://127.0.0.1:3001/health` và assert JSON bằng `node` (xem Ghi chú 3) | **verified** | `HTTP/1.1 200 OK`, `Content-Type: application/json; charset=utf-8`, body `{"status":"ok"}`; `curl -i` exit 0. `curl -sS ... \| node -e '…process.exit(j.status==="ok"?0:1)'` → in `parsed: {"status":"ok"}`, exit **0**. Không có `WWW-Authenticate`. |
| S4 | Đường dẫn không tồn tại (R3) | 2.3 | `curl -o /dev/null -s -w '%{http_code}' http://127.0.0.1:3001/khong-ton-tai` | **verified** | in ra `404`, `curl-exit=0`. |
| S5 | `PORT` không hợp lệ → dừng (R2) | 2.3 + 2.3b | Ba lần `docker run --rm -e PORT=<giá trị> ivr-backend`, mỗi lần một giá trị: `""`, `abc`, `70000` | **verified** | `PORT=''` → **exit 1**; `PORT='abc'` → **exit 1**; `PORT='70000'` → **exit 1**. Cả ba: `grep -c 'successfully started'` = **0**. Thông báo lỗi ra stderr, ví dụ `[Bootstrap] Không khởi động được: biến PORT phải là số nguyên, nhận được "abc"…`. Không có Unix socket: `ls -A` trong workdir của image (`/repo/apps/backend`) chỉ có `dist`, `node_modules`, `package.json` — **không** có file `abc`. Chạy nền `-e PORT=abc -p 3000:3000` → container tự thoát, `curl :3000` → `HTTP=000`, exit **7** (không cổng TCP nào mở). |

### Tiêu chí cấu trúc của change (nguồn: `proposal.md`)

| # | Tiêu chí | Task cài đặt | Kịch bản kiểm | Trạng thái | Bằng chứng |
|---|---|---|---|---|---|
| AC-1 | Layout `apps/`, không còn `services/` | 1.1 | `git mv services/frontend apps/frontend`; `test -f apps/frontend/package.json`; `test ! -d services` | **verified** | Cả hai `test` exit **0**. `git status --short \| awk '{print $1}' \| sort \| uniq -c` → `70 R` (70/70 file là rename, **không** có `D`/`A`). `rmdir services` exit 0. |
| AC-2 | Frontend không hồi quy (64 + 81) | 1.2, 1.3 | `docker compose --profile test run --rm frontend-test npm test` — chạy **hai lần** (task 1.4 trước khi động backend, task 5.1 sau toàn bộ thay đổi) | **verified** | Cả hai lần: `Test Files 8 passed (8)`, `Tests 64 passed (64)`, Playwright `81 passed (34.0s)` / `81 passed (33.8s)`, exit **0**. Log: `test-results/frontend-1.4-regression.log`, `test-results/frontend-5.1-regression.log`. |
| AC-3 | Frontend build được ở đường dẫn mới | 1.2, 1.3 | `grep -c "services/" apps/frontend/Dockerfile`; `docker compose build frontend`; `FRONTEND_PORT=18080 docker compose up -d frontend` rồi `curl http://127.0.0.1:18080/` | **verified** | `grep -c` → **0**. `docker compose -p apps-nestjs-apply build frontend backend` exit **0** (`naming to docker.io/library/ivr-frontend:latest done`). `curl` → `HTTP=200`, exit 0, HTML chứa `<div id="root"></div>` (`grep -c 'id="root"'` = 1). Sau đó `docker compose -p apps-nestjs-apply down` exit 0. |
| AC-4 | Khung backend modular monolith, ESM, TS 6, không `.git` con | 2.1, 2.2 | `find apps -name .git`; `grep -E '"@nestjs/(common\|core\|platform-express\|testing)": "\^' apps/backend/package.json`; đọc cây `src/`; đọc version cài thật | **verified** | `find` → **rỗng**. `grep` → exit **1** (không khớp caret nào). Cài thật: `@nestjs/core` **12.3.3**, `@nestjs/common` **12.3.3**, `@nestjs/testing` **12.3.3**, `@nestjs/cli` **12.0.11**, `typescript` **6.0.3**, `vitest` **4.1.12**. `package.json` có `"type": "module"`, import nội bộ ghi `.js`. Cây `src/`: `main.ts`, `app.module.ts`, `config/{port.ts,port.spec.ts}`, `modules/health/{health.module.ts,health.controller.ts,health.controller.spec.ts}`. `grep -rn "Hello World" apps/backend/src` → rỗng (exit 1); `GET /` trả **404** (assert trong e2e). Chỉ một `.git` ở gốc (`find . -name .git -maxdepth 3`). |
| AC-5 | Backend test xanh trong container | 2.2, 2.3, 2.3b | `docker compose --profile test run --rm backend-test npm test` | **verified** | exit **0**. Unit: `src/config/port.spec.ts (16 tests)`, `src/modules/health/health.controller.spec.ts (1 test)` → `Test Files 2 passed (2)`, `Tests 17 passed (17)`. E2E: `test/health.e2e-spec.ts (4 tests)` → `Test Files 1 passed (1)`, `Tests 4 passed (4)`. Không dòng `failed`. Log: `test-results/backend/npm-test.log`. |
| AC-6 | Đóng gói + compose chạy được | 3.1, 3.2 | `docker build -f apps/backend/Dockerfile -t ivr-backend .`; `docker compose -p apps-nestjs-apply up -d backend` (BACKEND_PORT=3020) → chờ log → `curl`; `docker compose -p apps-nestjs-apply down` | **verified** | Build exit **0** (`naming to docker.io/library/ivr-backend:latest done`). `up -d` exit 0; chờ 200 ms tới `Nest application successfully started` (không `sleep` mù); `[Bootstrap] Lắng nghe trên cổng 3000 theo biến PORT` (container `PORT=3000`). `curl :3020/health` → `{"status":"ok"}`, `HTTP=200`, exit **0**. `docker compose ps` → `apps-nestjs-apply-backend-1 running 0.0.0.0:3020->3000/tcp`. Sau `down`: `docker ps -a --filter label=com.docker.compose.project=apps-nestjs-apply` → **0** container; container của worktree khác `ivr-callflow-pbx-frontend-1` vẫn chạy nguyên. |
| AC-7 | Không còn đường dẫn cũ ngoài lịch sử | 1.2, 4.1–4.4 | `grep -rn "services/" --include=*.md --include=*.ts --include=*.json --include=*.yaml --include=Dockerfile .` | **verified** | Kết quả **chỉ** nằm trong `openspec/changes/**` (change hiện tại + 2 change đã archive). Không file mã nguồn/tài liệu nào khớp. `grep -n "services/" README.md` → rỗng (exit 1); `grep -n "services/" AGENTS.md` → rỗng (exit 1); `grep -rn "services/" apps/frontend/README.md` → rỗng. |

## Kết quả `openspec`

| Lệnh | Kết quả |
|---|---|
| `openspec validate apps-modular-monolith --strict` | `Change 'apps-modular-monolith' is valid` |
| `openspec validate --all` | `Totals: 9 passed, 0 failed (9 items)` |
| `openspec validate --specs` | `Totals: 8 passed, 0 failed (8 items)` |
| `openspec instructions apply --change apps-modular-monolith --json` | đọc được; `progress.total = 21` |
| `openspec/config.yaml`: 4 nhóm `rules` + 10 `guidance` | `rules groups: ['proposal','specs','design','tasks']` (4), `guidance: 10`, **không** có key `context` |
| `git diff HEAD -- openspec/config.yaml` | rỗng — apply **không** sửa `config.yaml` (đúng task 4.3) |

**Một chi tiết cần nói rõ về task 4.3:** task ghi kỳ vọng "`git diff origin/develop --
openspec/config.yaml` … không có dòng nào nói `services/`". Chạy thật thì diff **có đúng 1 dòng**
khớp `services/`, nhưng là dòng **bị xoá** (dấu `-`), nằm trong phần ghi đè theo yêu cầu:
`-  Monorepo IVR-Callflow-PBX: mỗi service nằm ở services/<service>/ và KHÔNG có git riêng —`.
Đó là key `context` cũ của bản `config.yaml` trên `develop`; bản ghi đè theo yêu cầu **không có**
key `context`, nên dòng đó **biến mất** chứ không phải còn sót. `grep -c "services/"
openspec/config.yaml` trên working tree = **0**. Vậy tinh thần của check (không còn câu nói
`services/` trong file hiện tại) đạt; câu chữ "diff không có dòng nào" thì **không** đạt theo nghĩa
đen — tôi ghi ra đây thay vì lặng lẽ coi là đạt.

## Browser acceptance (Playwright)

Change này **không** thêm/đổi hành vi giao diện; phần browser acceptance là **hồi quy trên
giao diện thật**, chạy bằng Chromium thật trong image Playwright, sau khi đổi đường dẫn.

- **Playwright version:** `@playwright/test` **1.63.0**, khớp image `mcr.microsoft.com/playwright:v1.63.0-noble`.
- **Chế độ:** **headless** — container không có GUI, nên chỉ chạy được headless. Không chạy headed.
- **Scenario B1 — giao diện còn dựng đúng ở layout mới:** nằm trong 81 e2e xanh (`builder-canvas`,
  `builder-palette`, `chrome-visual`, `tokens`…), tất cả dùng `page.goto` + assert UI thật.
- **Scenario B2 — hành vi sau khi tải lại vẫn đúng như đã chốt:** `e2e/reload.spec.ts` chạy và xanh —
  log: `✓ 45 e2e/reload.spec.ts:14:1 › TC-FLOW-025 — tạo đầu số + lưu bản nháp, tải lại trang → đầu số và phiên bản về đúng trạng thái gốc`.
  Đây đúng là chiều **reset** (kho giả lập trong bộ nhớ); **không** sửa thành assert persistence.
- **Scenario B3 — đường dẫn lỗi ở tầng giao diện:** `e2e/error-states.spec.ts` chạy và xanh — 8 test
  `✓ 20`, `✓ 26`, `✓ 29`, `✓ 33`, `✓ 37`, `✓ 38`, `✓ 39`, `✓ 42` trong log.
- **Ảnh sinh lại:** `apps/frontend/test-results/tc-flow-034/{numbers,builder,drawer}.png`
  (mtime `2026-11-05 23:13:36`, kích thước 59 575 / 113 235 / 131 844 bytes) do `chrome-visual.spec.ts` ghi ra.
- **Tài nguyên cần dọn:** volume `apps-nestjs-apply_frontend_node_modules` và
  `apps-nestjs-apply_backend_node_modules` (cache dependency cho profile `test`); không có container
  nào để lại. Không xoá `test-results/` của lượt chạy khác.

## Tự review theo tiêu chí ngữ nghĩa (task 5.3)

**Kết luận: ĐẠT** — xét theo từng requirement, không chỉ từng scenario.

- **R1 "Dịch vụ khởi động trên cổng cấu hình được"** — đáp ứng. Đọc `main.ts` cạnh `config/port.ts`:
  chỉ **một** chỗ đọc `PORT` (`resolvePort(process.env)` trong `main.ts`); không nơi nào khác gọi
  `process.env.PORT` (đã grep). `NestFactory.create` không nhận tham số cổng, cổng chỉ truyền vào
  `app.listen(...)`.
- **R2 "PORT không hợp lệ làm dịch vụ dừng"** — đáp ứng. `resolvePort` trả `{ok:false}` cho chuỗi
  rỗng, khoảng trắng, ký tự không phải chữ số, ngoài khoảng; `main.ts` gọi `process.exit(1)` **trước**
  `NestFactory.create`/`listen`, nên không có socket nào được mở. Hành vi này đã đo bằng container
  ở S5, không chỉ bằng unit test.
- **R3 "Điểm kiểm tra sức khoẻ trả trạng thái sẵn sàng"** — đáp ứng. `HealthModule` khai
  `@Controller('health')` + `@Get()` trả `{ status: 'ok' }`; không guard, không đòi tham số.
- **Failure path 404 không bị nuốt:** không có exception filter toàn cục nào được đăng ký (đã grep
  `useGlobalFilters`/`APP_FILTER` → không có), nên 404 mặc định của Nest/Express vẫn nổi lên; e2e
  assert cả `/khong-ton-tai` lẫn `/` (đường dẫn của scaffold cũ) đều **404**.
- **`PORT` không bị đọc hai nơi lệch nhau:** `grep -rn "process.env.PORT" apps/backend/src` chỉ khớp
  **một dòng comment** trong `config/port.ts` (giải thích vì sao không dùng
  `process.env.PORT ?? 3000`); không có chỗ nào đọc `process.env.PORT` thật. `main.ts` truyền cả
  `process.env` vào `resolvePort(...)`, còn `resolvePort` là hàm thuần chỉ đọc `env.PORT`. Dockerfile
  **không** đặt `ENV PORT` (xem Deviations).
- **Không thừa kế scaffold:** `AppController`/`AppService` và test của chúng **không** được mang sang
  (không tồn tại trong `apps/backend/src`); `GET /` trả 404 thay vì `Hello World!`.

## Việc không áp dụng — kèm bằng chứng

Không mục nào dưới đây bị "bỏ qua im lặng"; mỗi mục có lý do kiểm được trong repo này.

| Hạng mục | Kết luận | Bằng chứng |
|---|---|---|
| Redis / rate-limit bucket | **not applicable** | `compose.yaml` chỉ khai `frontend`, `backend`, `frontend-test`, `backend-test`; không dependency Redis trong hai `package.json`; không middleware rate-limit trong `src/`. |
| RLS context / database | **not applicable** | Không có PostgreSQL, không ORM, không migration trong `apps/`. Backend chỉ có `HealthModule`. "Zero row" không được dùng làm bằng chứng cho bất cứ điều gì. |
| Role/tenant/auth | **not applicable** | Không có module auth, guard, hay khái niệm tenant; mọi request tới `/health` là ẩn danh (assert `www-authenticate` undefined). |
| Locale switching | **not applicable** | Giao diện chỉ một ngôn ngữ; Playwright không override `locale` trong `playwright.config.ts`. |
| `npm run smoke/build/test:integration/contracts:check/test:e2e` ở gốc repo | **not applicable** | Gốc repo **không có** `package.json` (theo Non-Goals của proposal). Entrypoint thật là script của từng app qua `docker compose`. |
| Migration dữ liệu / rollback dữ liệu | **not applicable** | Change không có schema, không có dữ liệu; rollback = `git revert`. |

## Deviations khỏi `design.md`

1. **Bỏ `ENV PORT=3000` khỏi `apps/backend/Dockerfile`** (design chỉ nói "image chạy
   `node dist/main.js`", không bắt buộc ENV). Lý do: nếu image đặt sẵn `ENV PORT=3000` thì scenario
   **S1** ("PORT không đặt") không còn kiểm được bằng `docker run` trần — lần chạy đầu của tôi đã
   cho ra log `Lắng nghe trên cổng 3000 theo biến PORT`, tức là nhánh "biến có mặt", không phải nhánh
   mặc định. Đã sửa và chạy lại S1: image giờ có `PORT=[UNSET]`, log `Biến PORT không được đặt, dùng
   cổng mặc định 3000`. Service `backend` trong compose vẫn đặt `PORT: "3000"` đúng như task 3.2.
2. **Thêm `*.tsbuildinfo` vào `.gitignore`** (không có trong task list). Lý do: `nest build` sinh
   `apps/backend/tsconfig.build.tsbuildinfo`, là sản phẩm build, không nên vào repo.
3. **`apps/backend/src/config/`** chứa `resolvePort` (task 2.3b gợi ý "ví dụ `resolvePort(env)`").
   Design xếp tên file/hàm vào nhóm "apply tự chọn", nên đây là lựa chọn trong phạm vi cho phép.
4. **Helper test `getHealth()`** trả kiểu `HealthResponse`; e2e dựng `AppModule` thật qua supertest
   như design yêu cầu.
5. **`npm test` của backend = `vitest run && vitest run --config ./vitest.config.e2e.ts`**, không chỉ
   `vitest run` như scaffold. Lý do: task 2.4 yêu cầu **một** lệnh `npm test` chạy xanh "cả unit lẫn
   e2e". Hai script `test:unit`/`test:e2e` vẫn giữ riêng.
6. **`compose.yaml` `backend-test` dùng `command: npm test`** (giống `frontend-test`), thay vì để
   trống. Lý do: giữ đối xứng với service test sẵn có và để `docker compose run` không cần gõ lệnh.
7. **Thêm `apps/backend/docker-entrypoint.sh` + `entrypoint:` cho `backend-test`** — không có trong
   `design.md`/`tasks.md`. Đây là **sửa một lỗi thật phát hiện khi tự kiểm trên máy sạch**, ghi chi
   tiết ở mục "Sự cố gặp phải" #1. Không đổi hành vi nào đã chốt; chỉ làm cho
   `docker compose --profile test run --rm backend-test npm test` chạy được từ volume rỗng.

## Sự cố gặp phải và cách xử lý

Theo `operations.apply.guidance`: ghi **lỗi quan sát được → giả thuyết → phép kiểm phân biệt → kết
quả**, và tách lỗi sản phẩm khỏi lỗi fixture/môi trường/cách gọi lệnh. Không nới timeout, không làm
yếu assertion.

### 1. `backend-test npm test` thoát 127 trên volume `node_modules` rỗng — **lỗi thật, đã sửa**

- **Quan sát:** `docker compose -p probeempty --profile test run --rm backend-test npm test` →
  `sh: 1: vitest: not found`, **exit 127**.
- **Giả thuyết:** volume `backend_node_modules` (mount đè `apps/backend/node_modules`) đang rỗng ở
  lần chạy đầu, nên dependency chưa được cài; `command: npm test` không tự cài gì.
- **Phép kiểm phân biệt:** chạy lại chính lệnh đó sau khi volume đã có dependency (đã `npm ci` thủ
  công trước đó) → **exit 0**. Nếu lỗi do code/spec thì phải đỏ ở cả hai trường hợp.
- **Kết luận kết quả:** đây là **khuyết điểm đóng gói** (service test không tự lo dependency), không
  phải lỗi sản phẩm, cũng không phải lỗi assertion. Ảnh hưởng trực tiếp tới Definition of Done: người
  review chạy đúng lệnh DoD trên máy sạch sẽ thấy 127.
- **Cách sửa:** thêm `apps/backend/docker-entrypoint.sh` (`npm ci` khi thiếu `node_modules/vitest`)
  và khai `entrypoint:` cho `backend-test`. Chọn entrypoint thay vì `command: sh -c 'npm ci && npm test'`
  vì `docker compose run <svc> <lệnh>` **thay `command`** nhưng **giữ `entrypoint`**, nên mọi dạng
  lệnh (`npm test`, `npm run lint`, `npx tsc --noEmit`) đều được bootstrap.
- **Kiểm lại:** `docker compose --profile test run --rm backend-test npm test` trên volume **rỗng** →
  log `[backend-test] node_modules chưa có dependency, chạy npm ci một lần…` rồi
  `Tests 17 passed (17)` + `Tests 4 passed (4)`, **exit 0**.

### 2. Cùng lỗi 127 ở `frontend-test` — **quan sát được nhưng KHÔNG sửa**

- **Quan sát:** `docker compose -p probeempty --profile test run --rm frontend-test npm test` →
  `sh: 1: vitest: not found`, **exit 127** trên volume rỗng.
- **Đánh giá:** đây là tình trạng **có từ trước** change này (service `frontend-test` không đổi thiết
  kế), và design quyết định 7 chỉ cho phép sửa `working_dir` + tên volume của nó. Sửa thêm sẽ vượt
  phạm vi change và đụng baseline 64+81 mà AC-2 dùng để chứng minh hồi quy.
- **Cách xử lý:** giữ nguyên; worktree này đã cài dependency vào volume `apps-nestjs-apply_*` nên lệnh
  DoD chạy xanh. **Người review nên biết:** trên volume hoàn toàn mới, `frontend-test npm test` cần
  `npm ci` một lần trước (giống cách tôi đã làm), nếu không sẽ thấy 127. Tôi ghi ra đây thay vì để
  người review tự phát hiện.

### 3. `jq` không có trên máy host — **lỗi công cụ, đã thay bằng phép kiểm tương đương**

Xem "Ghi chú kỹ thuật" #1.

### 4. Probe S5 gọi sai (`-w /probe`) — **lỗi cách gọi, đã chạy lại**

Xem "Ghi chú kỹ thuật" #3.

## Ghi chú kỹ thuật trong lúc kiểm
1. **`jq` không có trên máy host** (`jq: command not found`, exit 127). Design ghi `jq -e '.status=="ok"'`;
   tôi thay bằng assert tương đương chạy `node -e` trên chính thân phản hồi (`process.exit(j.status==="ok"?0:1)`),
   exit 0. Đây là thay thế công cụ, không phải nới assertion.
2. **Cổng 8080 bị worktree khác chiếm** → dùng `FRONTEND_PORT=18080`; **backend** dùng
   `BACKEND_PORT=3020` cho lần kiểm compose để không đụng cổng. Không `kill` tiến trình lạ.
3. **Một lần probe S5 sai cách gọi** (tôi truyền `-w /probe` cho `docker run`, làm `node dist/main.js`
   không tìm thấy file → `MODULE_NOT_FOUND`, exit 1 **vì lý do sai**). Đây là **lỗi invocation**, không
   phải bằng chứng cho R2. Đã chạy lại đúng cách (`docker run --rm -e PORT=abc ivr-backend`, không đổi
   workdir) và chỉ dùng kết quả của lần chạy lại.
4. **`PORT=4010` không kiểm "cổng 3000 đóng" bằng cách nhìn `ss` trên host**, mà bằng `curl` tới
   `127.0.0.1:3000` với `--max-time 5` → exit 7 kèm `Failed to connect`, vì host không publish cổng
   3000 trong lần chạy đó.

## Tài nguyên đã tạo và đã dọn

| Tài nguyên | Tạo bằng | Trạng thái |
|---|---|---|
| Container `s1probe`, `s2probe`, `s34probe`, `s3probe` | `docker run -d --name …` | đã `docker stop` (dùng `--rm` nên không còn) |
| Container `s5probe` | `docker run -d --name s5probe -e PORT=abc` | tự thoát; đã `docker rm -f` |
| Compose project `apps-nestjs-apply` (service `backend`, `frontend`) | `docker compose -p apps-nestjs-apply up -d` | đã `docker compose -p apps-nestjs-apply down`; **0** container còn lại |
| Volume `apps-nestjs-apply_frontend_node_modules`, `apps-nestjs-apply_backend_node_modules` | `docker compose --profile test run` | **còn** (cache dependency cho lần chạy test sau; không xoá vì không được cấp phép dọn phá huỷ) |
| Ảnh `ivr-backend`, `ivr-frontend` | `docker build` / `docker compose build` | **còn** (là sản phẩm của change) |

Container `ivr-callflow-pbx-frontend-1` của worktree khác **không** bị đụng trong suốt quá trình.
