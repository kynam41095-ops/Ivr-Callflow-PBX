# IVR-Callflow-PBX

Monorepo của IVR Callflow PBX — nhiều service trong **một** git repo, mỗi service build bằng Dockerfile riêng.

## Cấu trúc

| Đường dẫn | Nội dung |
|---|---|
| `services/<service>/` | Mã nguồn từng service. Không có git riêng — chỉ repo gốc có `.git`. |
| `contracts/` | Contract dùng chung giữa các service, một bản duy nhất. Hiện có `flow-document.schema.json`. |
| `openspec/` | Nguồn sự thật về hành vi: `openspec/specs/` là hiện trạng, `openspec/changes/` là thay đổi đang làm. |
| `compose.yaml` | Môi trường local (dev + profile `test`). |
| `AGENTS.md` | Quy tắc làm việc trong repo. |

## Service hiện có

| Service | Mô tả | Mã nguồn |
|---|---|---|
| `frontend` | SPA IVR Builder: React 19 + TypeScript + `@xyflow/react`, dựng bằng Vite. | `services/frontend/` |

## Build và test

Build image của service frontend (context là gốc repo, để `contracts/` đi cùng):

```bash
docker compose build frontend      # hoặc: docker build -f services/frontend/Dockerfile -t ivr-frontend .
```

Chạy test trong container (Vitest + Playwright):

```bash
docker compose --profile test run --rm frontend-test npm test
```

Chạy dev server:

```bash
docker compose up frontend         # http://localhost:5173
```

Chi tiết từng lệnh của frontend: `services/frontend/README.md`.
