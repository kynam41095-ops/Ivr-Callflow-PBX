# frontend — Nền giao diện IVR Builder

SPA dựng bằng Vite: React 19 + TypeScript + `@xyflow/react`. Test unit chạy Vitest (môi trường `node`), test e2e chạy Playwright trên Chromium.

## Yêu cầu

- Node 24 (đã kiểm chứng với v24.15)
- npm đi kèm Node

## Cài đặt tái lập trên máy khác

```bash
npm ci
npx playwright install chromium
```

## Chạy môi trường dev

```bash
npm run dev
```

Mở http://localhost:5173.

## Bốn lệnh kiểm

```bash
npm test          # vitest run && playwright test --pass-with-no-tests
npm run typecheck # tsc --noEmit
npm run build     # vite build
npm run lint      # eslint .
```

## Xem thử bản build

```bash
npm run build
npx vite preview
```
