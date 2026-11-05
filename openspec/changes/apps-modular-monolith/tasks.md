# Tasks

> Quy ước: mọi lệnh chạy **từ gốc repo**. Kiểm bằng container, không cần Node/Chromium trên máy.
> Mỗi task gắn với tiêu chí trong bảng acceptance của `design.md` (S1–S4, AC-1…AC-7).
> `tasks.md` là checklist chuẩn; todo nội bộ chỉ là góc nhìn tạm.

## 1. Đổi layout services → apps (AC-1, AC-2, AC-3, AC-7)

- [ ] 1.1 `git mv services/frontend apps/frontend`, xoá `services/` nếu còn rỗng. Kiểm (AC-1):
      `test -f apps/frontend/package.json` và `test ! -d services` cùng thoát 0; `git status
      --short` ghi `R` cho các file đổi tên, không phải chuỗi `D` + `A`.
- [ ] 1.2 Đổi đường dẫn trong `apps/frontend/Dockerfile` (`COPY apps/frontend …`,
      `COPY --from=build /repo/apps/frontend/dist …`) và trong comment của
      `apps/frontend/src/contracts.ts` (chữ `services/frontend/src` → `apps/frontend/src`;
      **không** đổi giá trị `SCHEMA_RELATIVE_PATH`). Kiểm (AC-3): `grep -c "services/"
      apps/frontend/Dockerfile` bằng 0 và `docker compose build frontend` thoát 0.
- [ ] 1.3 Đổi `compose.yaml`: `dockerfile: apps/frontend/Dockerfile`, comment đầu file,
      `working_dir: /repo/apps/frontend`. Kiểm (AC-3): `docker compose config` thoát 0 và đầu ra
      không còn `services/`.
- [ ] 1.4 Chạy hồi quy giao diện thật ở layout mới — **chốt chặn trước khi động vào backend**.
      Kiểm (AC-2): `docker compose --profile test run --rm frontend-test npm test` có `64 passed`
      (Vitest) và `81 passed` (Playwright), mã thoát 0; xác nhận trong log có chạy
      `reload.spec.ts` (B2, assert trạng thái **về gốc** sau reload) và `error-states.spec.ts`
      (B3); ảnh `test-results/tc-flow-034/*.png` được sinh lại. Ghi vào `apply-report.md`: phiên
      bản Playwright `1.63.0`, "headless — container không có GUI", đường dẫn ảnh.

## 2. Khung backend NestJS 12 (AC-4, AC-5)

- [ ] 2.1 Tạo `apps/backend` từ `nest new` bản ESM (`--skip-git`, `--no-observe`), ghim version
      cụ thể trong `package.json`: `@nestjs/common`, `@nestjs/core`,
      `@nestjs/platform-express`, `@nestjs/testing` = `12.3.3`; `typescript` = `~6.0.3`. Kiểm
      (AC-4): `grep -E '"@nestjs/(common|core|platform-express|testing)": "\^'
      apps/backend/package.json` **không khớp** gì; `find apps -name .git` rỗng;
      `node -p "require('./apps/backend/node_modules/typescript/package.json').version"` in
      `6.0.x`.
- [ ] 2.2 Thêm `HealthModule` ở `src/modules/health/` (`health.controller.ts`, `health.module.ts`)
      trả `GET /health` → `200 {status:"ok"}`, nối vào `AppModule`, và **xoá** `AppController` /
      `AppService` mẫu của scaffold cùng test của chúng (để `GET /` không còn trả "Hello
      World!"). Kiểm (AC-4, AC-5): `src/modules/health/health.controller.spec.ts` xanh;
      `grep -rn "Hello World" apps/backend/src` rỗng.
- [ ] 2.3 `main.ts` đọc `process.env.PORT ?? 3000`; thêm test e2e `test/health.e2e-spec.ts` boot
      `AppModule` bằng `supertest` kiểm `/health` trả `200` + `status: "ok"` (S3) và đường dẫn
      lạ trả `404` (S4). Kiểm (AC-5): `npm run test:e2e` trong container backend-test xanh, log
      ghi rõ hai test này.
- [ ] 2.4 Chạy trọn bộ test backend trong container. Kiểm (AC-5):
      `docker compose --profile test run --rm backend-test npm test` xanh cả unit lẫn e2e, không
      có `failed`; lưu log đầy đủ vào `test-results/backend/` (không xoá log của lượt đang chạy).

## 3. Đóng gói và compose cho backend (AC-6)

- [ ] 3.1 Thêm `apps/backend/Dockerfile` multi-stage (`node:24-bookworm-slim` build → runtime slim
      chạy `node dist/main.js`), context = gốc repo. Kiểm (AC-6):
      `docker build -f apps/backend/Dockerfile -t ivr-backend .` thoát 0.
- [ ] 3.2 Thêm service `backend` (cổng công bố `${BACKEND_PORT:-3000}` → `3000`) và `backend-test`
      vào `compose.yaml`; backend chạy với `PORT=3000` bên trong container. Kiểm (AC-6):
      `docker compose config` thoát 0; `docker compose up -d backend`, chờ log `Nest application
      successfully started` (**không** `sleep` mù), rồi `curl -fsS
      http://127.0.0.1:3000/health` trả `{"status":"ok"}`; `docker compose down` sau đó và
      `docker compose ps` không còn service sót. Nếu cổng 3000 bị chiếm: ghi blocker môi trường,
      dùng `BACKEND_PORT` khác, **không** `kill` tiến trình lạ.
- [ ] 3.3 Nghiệm thu cổng bằng container thật (S1, S2): S1 chạy `docker run --rm -p 3001:3000
      ivr-backend` (**không** truyền `-e PORT` — `-e PORT=` tạo chuỗi rỗng, `??` không bắt được);
      S2 chạy với `-e PORT=4010 -p 4010:4010`. Kiểm: `curl` tới cổng tương ứng trả `200`; ở S2
      `curl` tới cổng `3000` **thất bại** (mã thoát ≠ 0). Ghi cả hai mã thoát vào
      `apply-report.md`; dùng `docker run --rm` để không để lại container.
- [ ] 3.4 Ghi `apps/backend/README.md`: chạy dev, build image, chạy test, quy ước module. Kiểm
      (AC-6): mỗi lệnh trong README chạy lại được từ trạng thái sạch (ít nhất `build` + `test`).

## 4. Tài liệu gốc và chính sách (AC-7)

- [ ] 4.1 `README.md`: bảng app (`frontend`, `backend`), lệnh build/test của cả hai, bỏ mọi nhắc
      `services/`. Kiểm (AC-7): `grep -n "services/" README.md` rỗng; đường dẫn nêu trong bảng
      tồn tại thật (`apps/frontend/package.json`, `apps/backend/package.json`).
- [ ] 4.2 `AGENTS.md`: thay `services/<service>/` bằng `apps/<app>/`, thêm quy ước module backend
      (một miền = một module dưới `src/modules/`) và ghi lý do ghim TypeScript 6 (Nest CLI chưa
      hỗ trợ TS 7). Kiểm (AC-7): `grep -n "services/" AGENTS.md` rỗng; mục TypeScript nêu đúng
      mã lỗi `TS 7 chưa có compiler API`.
- [ ] 4.3 `openspec/config.yaml`: sửa `context` sang `apps/<app>/`, giữ nguyên `rules` và
      `operations.apply.guidance` vừa bổ sung. Kiểm (AC-7): `openspec instructions apply --change
      apps-modular-monolith --json` trả `context` đã sửa, không còn `services/`, và vẫn có
      `rules.design` + `rules.tasks`; `openspec validate --specs` xanh.
- [ ] 4.4 `apps/frontend/README.md`: đổi `services/frontend` → `apps/frontend`. Kiểm (AC-7):
      `grep -rn "services/" apps/frontend/README.md` rỗng.

## 5. Nghiệm thu tích hợp và review (AC-1…AC-7)

- [ ] 5.1 Từ trạng thái sạch, chạy lại toàn bộ và đối chiếu **từng** tiêu chí: AC-2 (`npm test`
      frontend 64 + 81), AC-5 (`npm test` backend), AC-3 + AC-6 (`docker compose build frontend
      backend`), S1–S4 (`curl` theo bảng). Kiểm: mỗi dòng của bảng acceptance trong `design.md`
      có trạng thái `verified` + bằng chứng thật trong `apply-report.md`; không dòng nào để trống
      hay ghi `implemented` mà không kiểm.
- [ ] 5.2 Không còn tham chiếu `services/` ngoài `openspec/changes/**` (lịch sử). Kiểm (AC-7):
      `grep -rn "services/" --include=*.md --include=*.ts --include=*.json --include=*.yaml
      --include=Dockerfile .` chỉ ra kết quả nằm trong `openspec/changes/`.
- [ ] 5.3 Tự review theo tiêu chí ngữ nghĩa, không chỉ chạy lại suite: đọc lại spec
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
