# IVR-Callflow-PBX

Monorepo của IVR Callflow PBX — nhiều app trong **một** git repo, mỗi app build bằng Dockerfile riêng.

## Cấu trúc

| Đường dẫn | Nội dung |
|---|---|
| `apps/<app>/` | Mã nguồn từng app. Không có git riêng — chỉ repo gốc có `.git`. |
| `contracts/` | Contract dùng chung giữa các app, một bản duy nhất. Hiện có `flow-document.schema.json`. |
| `openspec/` | Nguồn sự thật về hành vi: `openspec/specs/` là hiện trạng, `openspec/changes/` là thay đổi đang làm. |
| `compose.yaml` | Môi trường local (dev + profile `test`). |
| `AGENTS.md` | Quy tắc làm việc trong repo. |

## App hiện có

| App | Mô tả | Mã nguồn |
|---|---|---|
| `frontend` | SPA IVR Builder: React 19 + TypeScript + `@xyflow/react`, dựng bằng Vite. | `apps/frontend/` |
| `backend` | Khung dịch vụ modular monolith: NestJS 12 + TypeScript 6, chạy ESM. Chưa có nghiệp vụ, chỉ `GET /health`. | `apps/backend/` |

## Build và test

Build image (context là gốc repo, để `contracts/` đi cùng):

```bash
docker compose build frontend backend
# hoặc riêng từng app:
#   docker build -f apps/frontend/Dockerfile -t ivr-frontend .
#   docker build -f apps/backend/Dockerfile -t ivr-backend .
```

Chạy test trong container:

```bash
# frontend: Vitest (unit) + Playwright (e2e) = 64 unit + 81 e2e
docker compose --profile test run --rm frontend-test npm test

# backend: Vitest unit + Vitest e2e (supertest)
docker compose --profile test run --rm backend-test npm test
```

Lần đầu chạy `backend-test` trên máy sạch, volume `backend_node_modules` còn rỗng — service tự
chạy `npm ci` một lần qua `apps/backend/docker-entrypoint.sh`, không cần gọi tay.

Chạy dev server và bản build:

```bash
docker compose --profile test run --rm --service-ports frontend-test \
  npm run dev -- --host 0.0.0.0 --port 5173     # http://localhost:5173

docker compose up frontend                      # http://localhost:8080
docker compose up backend                       # http://localhost:3000/health
```

Cổng: `FRONTEND_PORT` đổi cổng công bố của frontend (mặc định `8080`), `BACKEND_PORT` đổi cổng
công bố của backend (mặc định `3000`). Bên trong container backend, tiến trình luôn lắng nghe
`PORT=3000`.

Chi tiết từng lệnh: `apps/frontend/README.md`, `apps/backend/README.md`.
