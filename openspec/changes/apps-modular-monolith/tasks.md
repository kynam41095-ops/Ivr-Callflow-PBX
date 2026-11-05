# Tasks

> Quy ước: mọi lệnh chạy **từ gốc repo**. Kiểm bằng container, không cần Node/Chromium trên máy.
> `tasks.md` là checklist chuẩn; todo nội bộ chỉ là góc nhìn tạm.

## 0. Đối chiếu requirement/scenario ↔ task (làm trước khi cài đặt)

Bảng dưới đây là bản đối chiếu bắt buộc của rule `tasks` mục 4. Cột "Task" phải trỏ tới task thật
ở các mục sau; nếu một scenario không có task thì đó là **thiếu coverage**, phải sửa artifact chứ
không được coi là xong.

| Requirement (trong `specs/service-health/spec.md`) | Scenario | Task cài đặt | Task kiểm | Trạng thái |
|---|---|---|---|---|
| R1 Dịch vụ khởi động trên cổng cấu hình được | Không đặt PORT | 2.3 | 3.3 (S1) | planned |
| R1 | Đặt PORT là số hợp lệ | 2.3 | 3.3 (S2) + 2.3b | planned |
| R2 PORT không hợp lệ làm dịch vụ dừng | PORT rỗng | 2.3 + 2.3b | 3.3b (S5) | planned |
| R2 | PORT không phải số | 2.3 + 2.3b | 3.3b (S5) | planned |
| R2 | PORT ngoài khoảng | 2.3 + 2.3b | 3.3b (S5) | planned |
| R3 Điểm kiểm tra sức khoẻ trả trạng thái sẵn sàng | Gọi health khi dịch vụ đang chạy | 2.2 + 2.3 | 2.3 + 3.3 (S1/S2) | planned |
| R3 | Đường dẫn không tồn tại | 2.3 | 2.3 (S4) | planned |

Tiêu chí cấu trúc của change (không thuộc `specs/`, nguồn là `proposal.md` What Changes và
Compatibility impact):

| Tiêu chí | Task cài đặt | Task kiểm | Trạng thái |
|---|---|---|---|
| AC-1 Layout `apps/`, không còn `services/` | 1.1 | 1.1 | planned |
| AC-2 Frontend không hồi quy (64 + 81) | 1.2, 1.3 | 1.4 | planned |
| AC-3 Frontend build được ở đường dẫn mới | 1.2, 1.3 | 1.2, 1.3, 5.1 | planned |
| AC-4 Khung backend modular monolith, ESM, TS 6, không `.git` con | 2.1, 2.2 | 2.1, 2.2 | planned |
| AC-5 Test backend xanh trong container | 2.2, 2.3, 2.3b | 2.4 | planned |
| AC-6 Đóng gói + compose chạy được | 3.1, 3.2 | 3.1, 3.2, 3.3, 3.3b | planned |
| AC-7 Không còn đường dẫn cũ ngoài lịch sử | 1.2, 4.1–4.4 | 4.1–4.4, 5.2 | planned |

**Quyết định còn mở ảnh hưởng phạm vi:** không còn. ESM đã chốt; Nest 12.x, không `package.json`
gốc, và việc `PORT` không hợp lệ phải dừng đều đã chốt trong `design.md`. Hai mục còn mở (nghiệp
vụ đầu tiên, CI) nằm ngoài phạm vi change nên không chặn.

## 1. Đổi layout services → apps (AC-1, AC-2, AC-3, AC-7)

- [x] 1.1 `git mv services/frontend apps/frontend`, xoá `services/` nếu còn rỗng. Kiểm (AC-1):
      `test -f apps/frontend/package.json` và `test ! -d services` cùng thoát 0; `git status
      --short` ghi `R` cho các file đổi tên, không phải chuỗi `D` + `A`.
- [x] 1.2 Đổi đường dẫn trong `apps/frontend/Dockerfile` (`COPY apps/frontend …`,
      `COPY --from=build /repo/apps/frontend/dist …`) và trong comment của
      `apps/frontend/src/contracts.ts` (chữ `services/frontend/src` → `apps/frontend/src`;
      **không** đổi giá trị `SCHEMA_RELATIVE_PATH`). Kiểm (AC-3): `grep -c "services/"
      apps/frontend/Dockerfile` bằng 0 và `docker compose build frontend` thoát 0.
- [x] 1.3 Đổi `compose.yaml`: `dockerfile: apps/frontend/Dockerfile`, comment đầu file,
      `working_dir: /repo/apps/frontend`. Kiểm (AC-3): `docker compose config` thoát 0 và đầu ra
      không còn `services/`.
- [x] 1.4 Chạy hồi quy giao diện thật ở layout mới — **chốt chặn trước khi động vào backend**.
      Kiểm (AC-2): `docker compose --profile test run --rm frontend-test npm test` có `64 passed`
      (Vitest) và `81 passed` (Playwright), mã thoát 0; xác nhận trong log có chạy
      `reload.spec.ts` (B2, assert trạng thái **về gốc** sau reload) và `error-states.spec.ts`
      (B3); ảnh `test-results/tc-flow-034/*.png` được sinh lại. Ghi vào `apply-report.md`: phiên
      bản Playwright `1.63.0`, "headless — container không có GUI", đường dẫn ảnh.

## 2. Khung backend NestJS 12 (AC-4, AC-5)

- [x] 2.1 Tạo `apps/backend` từ `nest new` bản ESM (`--skip-git`, `--no-observe`), ghim version
      cụ thể trong `package.json`: `@nestjs/common`, `@nestjs/core`,
      `@nestjs/platform-express`, `@nestjs/testing` = `12.3.3`; `typescript` = `~6.0.3`. Kiểm
      (AC-4): `grep -E '"@nestjs/(common|core|platform-express|testing)": "\^'
      apps/backend/package.json` **không khớp** gì; `find apps -name .git` rỗng;
      `node -p "require('./apps/backend/node_modules/typescript/package.json').version"` in
      `6.0.x`.
- [x] 2.2 Thêm `HealthModule` ở `src/modules/health/` (`health.controller.ts`, `health.module.ts`)
      trả `GET /health` → `200 {status:"ok"}`, nối vào `AppModule`, và **xoá** `AppController` /
      `AppService` mẫu của scaffold cùng test của chúng (để `GET /` không còn trả "Hello
      World!"). Kiểm (AC-4, AC-5): `src/modules/health/health.controller.spec.ts` xanh;
      `grep -rn "Hello World" apps/backend/src` rỗng.
- [x] 2.3 `main.ts` đọc `PORT` theo đúng thứ tự ưu tiên đã chốt ở design: không đặt → `3000`;
      có mặt nhưng không phải số nguyên `1`–`65535` (kể cả chuỗi rỗng) → in lỗi rồi `process.exit(1)`,
      **không** gọi `listen` (tránh ca `PORT=abc` tạo Unix socket). Thêm test e2e
      `test/health.e2e-spec.ts` boot `AppModule` bằng `supertest` kiểm `/health` trả `200` +
      `status: "ok"` (S3) và đường dẫn lạ trả `404` (S4). Kiểm (AC-5): `npm run test:e2e` trong
      container backend-test xanh, log ghi rõ hai test này.
- [x] 2.3b Thêm test đơn vị cho phần đọc `PORT` (tách hàm thuần, ví dụ `resolvePort(env)`): không
      đặt → `3000`; `"4010"` → `4010`; `""`, `"   "`, `"abc"`, `"70000"`, `"0"` → lỗi. Kiểm
      (AC-5): các ca này xanh trong `npm test`; chạy thêm `PORT=abc docker run --rm ivr-backend`
      thấy mã thoát ≠ 0 và **không** có file `abc` (S5).
- [x] 2.4 Chạy trọn bộ test backend trong container. Kiểm (AC-5):
      `docker compose --profile test run --rm backend-test npm test` xanh cả unit lẫn e2e, không
      có `failed`; lưu log đầy đủ vào `test-results/backend/` (không xoá log của lượt đang chạy).

## 3. Đóng gói và compose cho backend (AC-6)

- [x] 3.1 Thêm `apps/backend/Dockerfile` multi-stage (`node:24-bookworm-slim` build → runtime slim
      chạy `node dist/main.js`), context = gốc repo. Kiểm (AC-6):
      `docker build -f apps/backend/Dockerfile -t ivr-backend .` thoát 0.
- [x] 3.2 Thêm service `backend` (cổng công bố `${BACKEND_PORT:-3000}` → `3000`) và `backend-test`
      vào `compose.yaml`; backend chạy với `PORT=3000` bên trong container. Kiểm (AC-6):
      `docker compose config` thoát 0; `docker compose up -d backend`, chờ log `Nest application
      successfully started` (**không** `sleep` mù), rồi `curl -fsS
      http://127.0.0.1:3000/health` trả `{"status":"ok"}`; `docker compose down` sau đó và
      `docker compose ps` không còn service sót. Nếu cổng 3000 bị chiếm: ghi blocker môi trường,
      dùng `BACKEND_PORT` khác, **không** `kill` tiến trình lạ.
- [x] 3.3 Nghiệm thu cổng bằng container thật (S1, S2): S1 chạy `docker run --rm -p 3001:3000
      ivr-backend` (**không** truyền `-e PORT` — `-e PORT=` là chuỗi rỗng, ca khác); S2 chạy với
      `-e PORT=4010 -p 4010:4010`. Kiểm: `curl` tới cổng tương ứng trả `200`; ở S2 `curl` tới
      cổng `3000` **thất bại** (mã thoát ≠ 0). Ghi cả hai mã thoát vào `apply-report.md`; dùng
      `docker run --rm` để không để lại container.
- [x] 3.3b Nghiệm thu `PORT` không hợp lệ bằng container thật (S5): chạy riêng ba lần
      `docker run --rm -e PORT= ivr-backend`, `-e PORT=abc`, `-e PORT=70000`. Kiểm: cả ba lần mã
      thoát ≠ `0`, không lần nào in `Nest application successfully started`; sau lần `PORT=abc`,
      kiểm trong workdir/container không có file `abc` (Unix socket). Ghi ba mã thoát vào
      `apply-report.md`.
- [x] 3.4 Ghi `apps/backend/README.md`: chạy dev, build image, chạy test, quy ước module. Kiểm
      (AC-6): mỗi lệnh trong README chạy lại được từ trạng thái sạch (ít nhất `build` + `test`).

## 4. Tài liệu gốc và chính sách (AC-7)

- [x] 4.1 `README.md`: bảng app (`frontend`, `backend`), lệnh build/test của cả hai, bỏ mọi nhắc
      `services/`. Kiểm (AC-7): `grep -n "services/" README.md` rỗng; đường dẫn nêu trong bảng
      tồn tại thật (`apps/frontend/package.json`, `apps/backend/package.json`).
- [x] 4.2 `AGENTS.md`: thay `services/<service>/` bằng `apps/<app>/`, thêm quy ước module backend
      (một miền = một module dưới `src/modules/`) và ghi lý do ghim TypeScript 6 (Nest CLI chưa
      hỗ trợ TS 7). Kiểm (AC-7): `grep -n "services/" AGENTS.md` rỗng; mục TypeScript nêu đúng
      mã lỗi `TS 7 chưa có compiler API`.
- [x] 4.3 `openspec/config.yaml`: **không sửa** — file đã được ghi đè nguyên văn theo yêu cầu và
      không có key `context`, nên không có gì phải "đổi sang `apps/`". Bốn ràng buộc trước đây nằm
      trong `context` (một `.git` ở gốc, contract một bản ở `contracts/`, build bằng Dockerfile
      context gốc, nội dung tiếng Việt) vẫn còn nguyên trong `AGENTS.md` (mục 4.2), nên không mất
      thông tin. Kiểm (AC-7): `git diff origin/develop -- openspec/config.yaml` chỉ có phần ghi đè
      theo yêu cầu, không có dòng nào nói `services/`; `openspec instructions apply --change
      apps-modular-monolith --json` trả đúng 10 `guidance` và 4 nhóm `rules`
      (proposal/specs/design/tasks); `openspec validate --specs` xanh.
- [x] 4.4 `apps/frontend/README.md`: đổi `services/frontend` → `apps/frontend`. Kiểm (AC-7):
      `grep -rn "services/" apps/frontend/README.md` rỗng.

## 5. Nghiệm thu tích hợp và review (AC-1…AC-7)

- [x] 5.1 Từ trạng thái sạch, chạy lại toàn bộ và đối chiếu **từng** tiêu chí: AC-2 (`npm test`
      frontend 64 + 81), AC-5 (`npm test` backend), AC-3 + AC-6 (`docker compose build frontend
      backend`), S1–S5 (`curl` và `docker run` theo bảng). Kiểm: mỗi dòng của bảng acceptance trong `design.md`
      có trạng thái `verified` + bằng chứng thật trong `apply-report.md`; không dòng nào để trống
      hay ghi `implemented` mà không kiểm.
- [x] 5.2 Không còn tham chiếu `services/` ngoài `openspec/changes/**` (lịch sử). Kiểm (AC-7):
      `grep -rn "services/" --include=*.md --include=*.ts --include=*.json --include=*.yaml
      --include=Dockerfile .` chỉ ra kết quả nằm trong `openspec/changes/`.
- [x] 5.3 Tự review theo tiêu chí ngữ nghĩa, không chỉ chạy lại suite: đọc lại spec
      `service-health` cạnh mã `HealthModule` + `main.ts` và xác nhận từng **requirement** (không
      chỉ từng scenario) được đáp ứng; kiểm `PORT` không bị đọc hai nơi lệch nhau; kiểm failure
      path 404 không nuốt lỗi. Kiểm: ghi kết luận review (đạt/không đạt + lý do) vào
      `apply-report.md`.

## Workflow follow-up

- Archive change bằng `/openspec-archive-change` sau khi 5.1–5.3 xanh và người đặt việc duyệt.
- Hai nhánh remote còn commit riêng trên nền layout `services/` (`agent/readme-agent-line-…`,
  `wip/gitlab-intake-scripts`) cần rebase sang layout mới ở lần làm việc kế tiếp trên nhánh đó;
  change này không sửa nhánh của người khác.
- `apply-report.md` nằm trong thư mục change và là artifact của bước apply — không tạo trước khi
  apply, vì nó phải chứa bằng chứng thật.
