# syntax=docker/dockerfile:1

# Image của service frontend.
# Build context là GỐC repo, vì frontend import contract dùng chung ở <repo>/contracts:
#   docker build -f services/frontend/Dockerfile -t ivr-frontend .

FROM node:24-bookworm-slim AS build
WORKDIR /repo

# Cài dependency trước khi copy mã nguồn để tận dụng cache layer.
COPY services/frontend/package.json services/frontend/package-lock.json services/frontend/
RUN cd services/frontend && npm ci

COPY contracts contracts
COPY services/frontend services/frontend
RUN cd services/frontend && npm run build

FROM nginx:1.29-alpine
COPY --from=build /repo/services/frontend/dist /usr/share/nginx/html
EXPOSE 80
