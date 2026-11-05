# backend — Khung dịch vụ IVR-Callflow-PBX

Backend là **modular monolith** dựng bằng **NestJS 12.3.3** trên **TypeScript 6.0.x**, chạy
**ESM** (`"type": "module"` trong `package.json`, nên import nội bộ phải ghi đuôi `.js`).
Test bằng **Vitest** (unit) + **supertest** (e2e), lint bằng `oxlint` / `oxlint-tsgolint`.

App nằm trong monorepo tại `apps/backend`; **không** có git riêng. Mọi lệnh dưới đây chạy
**từ gốc repo**; Node nằm trong container, không cần cài trên máy.

Hiện tại backend **chưa có nghiệp vụ nào** — chỉ có `GET /health` để kiểm khung chạy được.
Miền nghiệp vụ đầu tiên sẽ là một change riêng.

## Quy ước module

Một miền nghiệp vụ = một module dưới `src/modules/<domain>/`:

```
src/
  main.ts                     # đọc PORT, dựng app, listen
  app.module.ts               # module gốc: chỉ `imports` các module con
  config/                     # hàm thuần dùng chung (ví dụ resolvePort)
  modules/
    health/                   # module của miền "health"
      health.module.ts        # @Module({ controllers, providers, imports })
      health.controller.ts    # khai đường dẫn HTTP
      health.controller.spec.ts
test/
  *.e2e-spec.ts               # test dựng cả AppModule bằng supertest, không mở cổng thật
```

- `AppModule` **không** khai `controllers` trực tiếp; thêm miền mới bằng cách tạo module dưới
  `src/modules/<domain>/` rồi import vào `AppModule`.
- Chỉ `config/` mới chứa hàm thuần đọc biến môi trường, để test được mà không cần dựng app.
- Không tạo thư mục miền rỗng: thư mục rỗng không kiểm được gì.

## Biến môi trường

| Biến | Ý nghĩa | Mặc định |
|---|---|---|
| `PORT` | Cổng TCP **bên trong container** mà tiến trình lắng nghe. Nếu biến có mặt nhưng không phải số nguyên `1`–`65535` (kể cả chuỗi rỗng), tiến trình in lỗi và thoát mã `1`, **không** mở cổng nào. | không đặt → `3000` |
| `BACKEND_PORT` | Cổng công bố ra máy host, chỉ dùng trong `compose.yaml`. Không phải biến của tiến trình. | `3000` |

Đừng dùng `process.env.PORT ?? 3000` trực tiếp: với `PORT=abc`, Node coi giá trị là đường dẫn
Unix socket nên app log "khởi động thành công" mà không có cổng TCP nào. Logic đọc cổng nằm ở
`src/config/port.ts` và có test cho từng ca.

## Chạy dev

```bash
docker compose --profile test run --rm backend-test npm run start:dev
```

Hoặc dựng app đã build rồi chạy:

```bash
docker compose build backend
docker compose up backend        # http://localhost:3000/health
```

## Build image

```bash
docker compose build backend
# hoặc: docker build -f apps/backend/Dockerfile -t ivr-backend .
```

Dockerfile multi-stage: `node:24-bookworm-slim` để build (`npm ci` + `nest build` + `npm prune
--omit=dev`), image runtime cũng là `node:24-bookworm-slim` chỉ chạy `node dist/main.js`.
Build context là gốc repo, giống frontend.

Kiểm nhanh sau khi build:

```bash
docker run --rm -d --name ivr-backend-probe -p 3001:3000 ivr-backend
curl -fsS http://127.0.0.1:3001/health    # {"status":"ok"}
docker stop ivr-backend-probe
```

## Test

```bash
docker compose --profile test run --rm backend-test npm test
```

`npm test` = `vitest run && vitest run --config ./vitest.config.e2e.ts` (unit rồi e2e).
Chạy riêng: `npm run test:unit`, `npm run test:e2e`.

Service `backend-test` tự cài dependency khi volume `backend_node_modules` còn rỗng (entrypoint
`docker-entrypoint.sh` chạy `npm ci` một lần), nên lần chạy đầu chậm hơn các lần sau. Không cần
gọi `npm ci` thủ công.

## Lint và typecheck

```bash
docker compose --profile test run --rm backend-test npm run lint
docker compose --profile test run --rm backend-test npx tsc --noEmit
```

## Vì sao TypeScript bị ghim ở 6

`typescript` để `~6.0.3`, **không** nâng lên 7. Nest CLI 12 từ chối TS 7 vì TS 7.0 chỉ phát hành
binary `tsc`, chưa có **compiler API** mà `nest build` cần (thông báo lấy từ
`@nestjs/cli/lib/ui/errors.js`: compiler API dự kiến trở lại ở 7.1). Lỗi chỉ nằm ở CLI của Nest,
không phải runtime, nhưng vẫn chọn TS 6 để giữ `nest build` / `nest start --watch` /
`nest generate` thay vì tự viết script `tsc`. Khi Nest hỗ trợ TS 7, nâng backend và frontend cùng
lúc (xem `AGENTS.md`).
