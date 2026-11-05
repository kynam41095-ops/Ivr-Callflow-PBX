# syntax=docker/dockerfile:1

# Image của service frontend.
# Build context là GỐC repo, vì frontend import contract dùng chung ở <repo>/contracts:
#   docker build -f apps/frontend/Dockerfile -t ivr-frontend .

FROM node:24-bookworm-slim AS build
WORKDIR /repo

# Cài dependency trước khi copy mã nguồn để tận dụng cache layer.
COPY apps/frontend/package.json apps/frontend/package-lock.json apps/frontend/
RUN cd apps/frontend && npm ci

COPY contracts contracts
COPY apps/frontend apps/frontend
RUN cd apps/frontend && npm run build

FROM nginx:1.29-alpine
COPY --from=build /repo/apps/frontend/dist /usr/share/nginx/html
EXPOSE 80
