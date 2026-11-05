# syntax=docker/dockerfile:1

# Image của app backend (NestJS 12, ESM).
# Build context là GỐC repo cho nhất quán với frontend (xem design.md quyết định 6):
#   docker build -f apps/backend/Dockerfile -t ivr-backend .

FROM node:24-bookworm-slim AS build
WORKDIR /repo/apps/backend

# Cài dependency trước khi copy mã nguồn để tận dụng cache layer.
COPY apps/backend/package.json apps/backend/package-lock.json ./
RUN npm ci

COPY apps/backend/tsconfig.json apps/backend/tsconfig.build.json apps/backend/nest-cli.json ./
COPY apps/backend/src src
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
WORKDIR /repo/apps/backend
ENV NODE_ENV=production

COPY --from=build /repo/apps/backend/node_modules node_modules
COPY --from=build /repo/apps/backend/dist dist
COPY apps/backend/package.json ./

# Cổng tiến trình lắng nghe bên trong container. Cổng công bố ra máy host là
# BACKEND_PORT trong compose.yaml — hai biến khác nhau, đừng lẫn.
#
# Cố ý KHÔNG đặt `ENV PORT=3000`: main.ts đã mặc định 3000 khi biến không có mặt,
# và compose.yaml đặt `PORT: "3000"` cho service `backend`. Đặt ENV ở đây sẽ làm
# trường hợp "không đặt PORT" (scenario S1 của service-health) không còn kiểm được
# bằng `docker run` trần — nó sẽ luôn thấy PORT đã được đặt.
EXPOSE 3000

# Chạy bằng node trực tiếp (không qua npm) để tín hiệu dừng tới đúng tiến trình.
CMD ["node", "dist/main.js"]
