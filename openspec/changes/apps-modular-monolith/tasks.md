# Tasks

> Quy ước: mọi lệnh chạy **từ gốc repo**. Kiểm bằng container, không cần Node/Chromium trên máy.

## 1. Đổi layout services → apps

- [ ] 1.1 `git mv services/frontend apps/frontend`, xoá `services/` nếu còn rỗng. Kiểm: `test -f
      apps/frontend/package.json`; `test ! -d services`; `git status` ghi nhận rename chứ không
      phải chuỗi delete + add.
- [ ] 1.2 Đổi đường dẫn trong `apps/frontend/Dockerfile` (`COPY apps/frontend …`,
      `COPY --from=build /repo/apps/frontend/dist …`) và trong comment đường dẫn của
      `apps/frontend/src/contracts.ts` (đổi chữ `services/frontend/src` thành
      `apps/frontend/src`, **không** đổi giá trị `SCHEMA_RELATIVE_PATH`). Kiểm: `grep -c
      "services/"` trong `apps/frontend/Dockerfile` bằng 0; `docker build -f
      apps/frontend/Dockerfile -t ivr-frontend .` exit 0; `npm test` vẫn đọc được schema.
- [ ] 1.3 Đổi `compose.yaml`: `dockerfile: apps/frontend/Dockerfile`, comment đầu file,
      `working_dir: /repo/apps/frontend`. Kiểm: `docker compose config` hợp lệ và không in
      `services/`.
- [ ] 1.4 Chốt chặn đổi layout: `docker compose --profile test run --rm frontend-test npm test`
      xanh **64 unit + 81 e2e** (baseline đo ngày 2026-11-05), và `docker compose build frontend`
      thành công. Kiểm: log hai lệnh, không có `failed`.

## 2. Khung backend NestJS 12

- [ ] 2.1 Tạo `apps/backend` từ `nest new` bản ESM (`--skip-git`, `--no-observe`), ghim version
      cụ thể trong `package.json` (`@nestjs/*` 12.3.x, `typescript` `~6.0.3`). Kiểm:
      `apps/backend/package.json` không còn ký tự `^`/`~` ở nhóm `@nestjs/*`; không có `.git`
      trong `apps/backend` (`find apps -name .git` rỗng).
- [ ] 2.2 Thêm `HealthModule` ở `src/modules/health/` (`health.controller.ts`, `health.module.ts`)
      trả `GET /health` → `200 {status:"ok"}`, nối vào `AppModule`, và **xoá** `AppController` /
      `AppService` mẫu của scaffold cùng test của chúng (để `GET /` không còn trả "Hello World!").
      Kiểm: test unit `src/modules/health/health.controller.spec.ts` xanh; `grep -rn "Hello
      World" apps/backend/src` rỗng.
- [ ] 2.3 `main.ts` đọc `process.env.PORT ?? 3000`, thêm test e2e `test/health.e2e-spec.ts` boot
      `AppModule` bằng `supertest` kiểm `/health` trả 200 + `status: "ok"` và đường dẫn lạ trả 404.
      Kiểm: `npm run test:e2e` xanh.
- [ ] 2.4 Chạy trọn bộ test backend. Kiểm: `docker compose --profile test run --rm backend-test npm
      test` xanh (unit + e2e), không có `failed`.

## 3. Đóng gói và compose cho backend

- [ ] 3.1 Thêm `apps/backend/Dockerfile` multi-stage (`node:24-bookworm-slim` build → runtime slim
      chạy `node dist/main.js`), context = gốc repo. Kiểm: `docker build -f apps/backend/Dockerfile
      -t ivr-backend .` exit 0.
- [ ] 3.2 Thêm service `backend` (cổng `${BACKEND_PORT:-3000}`) và `backend-test` vào
      `compose.yaml`. Kiểm: `docker compose config` hợp lệ; `docker compose up -d backend` rồi
      `curl -fsS http://127.0.0.1:3000/health` trả `{"status":"ok"}`, sau đó `docker compose down`.
- [ ] 3.3 Ghi `apps/backend/README.md`: chạy dev, build image, chạy test, quy ước module. Kiểm:
      mỗi lệnh trong README chạy lại được từ trạng thái sạch (ít nhất `build` + `test`).

## 4. Tài liệu gốc và chính sách

- [ ] 4.1 `README.md`: bảng app (`frontend`, `backend`), lệnh build/test của cả hai, bỏ mọi nhắc
      `services/`. Kiểm: `grep -n "services/" README.md` rỗng; đường dẫn nêu trong bảng tồn tại
      thật (`apps/frontend/package.json`, `apps/backend/package.json`).
- [ ] 4.2 `AGENTS.md`: thay `services/<service>/` bằng `apps/<app>/`, thêm quy ước module backend
      (một miền = một module dưới `src/modules/`) và ghi lý do ghim TypeScript 6 (Nest CLI chưa
      hỗ trợ TS 7). Kiểm: `grep -n "services/" AGENTS.md` rỗng; mục TypeScript nêu đúng mã lỗi
      `TS 7 chưa có compiler API`.
- [ ] 4.3 `openspec/config.yaml`: sửa `context` sang `apps/<app>/`, giữ nguyên các ràng buộc còn
      lại (một `.git`, contract một bản, tiếng Việt). Kiểm: `openspec context` không còn
      `services/`; `openspec validate --specs` xanh.
- [ ] 4.4 `apps/frontend/README.md`: đổi `services/frontend` → `apps/frontend`. Kiểm:
      `grep -rn "services/" apps/frontend/README.md` rỗng.

## 5. Nghiệm thu tích hợp

- [ ] 5.1 Từ trạng thái sạch, chạy lại toàn bộ: test frontend (64 + 81), test backend, build cả
      hai image. Kiểm: ba lệnh exit 0, log ghi số test khớp.
- [ ] 5.2 Không còn tham chiếu `services/` ngoài `openspec/changes/**` (lịch sử). Kiểm:
      `grep -rn "services/" --include=*.md --include=*.ts --include=*.json --include=*.yaml
      --include=Dockerfile .` chỉ ra kết quả nằm trong `openspec/changes/`.

## Workflow follow-up

- Archive change bằng `/openspec-archive-change` sau khi 5.1 + 5.2 xanh và người đặt việc duyệt.
- Hai nhánh remote còn commit riêng trên nền layout `services/` (`agent/readme-agent-line-…`,
  `wip/gitlab-intake-scripts`) cần rebase sang layout mới ở lần làm việc kế tiếp trên nhánh đó;
  change này không sửa nhánh của người khác.
