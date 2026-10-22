# frontend — Nền giao diện IVR Builder

SPA dựng bằng Vite: React 19 + TypeScript + `@xyflow/react`. Test unit chạy Vitest (môi trường `node`), test e2e chạy Playwright trên Chromium.

Service nằm trong monorepo tại `services/frontend`; **không** có git riêng. Contract dùng chung (`flow-document.schema.json`) nằm ở `<repo>/contracts/`, đường dẫn được khai một chỗ duy nhất trong `src/contracts.ts`.

Mọi lệnh dưới đây chạy **từ gốc repo**; Node và Chromium nằm trong container, không cần cài trên máy.

## Chạy dev server

```bash
docker compose --profile test run --rm --service-ports frontend-test \
  npm run dev -- --host 0.0.0.0 --port 5173
```

Mở http://localhost:5173.

## Build image và chạy bản tĩnh

```bash
docker compose build frontend   # hoặc: docker build -f services/frontend/Dockerfile -t ivr-frontend .
docker compose up frontend      # http://localhost:8080
```

Dockerfile build bằng `node:24-bookworm-slim` rồi phục vụ `dist` bằng `nginx:1.29-alpine`; build context là gốc repo để lấy `contracts/`.

## Test

```bash
docker compose --profile test run --rm frontend-test npm test
```

`npm test` = `vitest run && playwright test --pass-with-no-tests` (64 unit + 81 e2e). Profile `test` dùng image Playwright khớp `@playwright/test` 1.63.0, mount cả repo và giữ `node_modules` trong volume riêng.

## Các lệnh kiểm khác

Chạy trong cùng container test:

```bash
docker compose --profile test run --rm frontend-test npm run typecheck
docker compose --profile test run --rm frontend-test npm run lint
docker compose --profile test run --rm frontend-test npm run build
```
