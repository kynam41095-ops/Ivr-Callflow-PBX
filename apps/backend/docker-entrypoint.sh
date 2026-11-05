#!/bin/sh
# Entrypoint của service `backend-test` (compose profile `test`).
#
# Vì sao cần: volume `backend_node_modules` được mount đè lên `apps/backend/node_modules`,
# nên lần chạy đầu tiên trên máy sạch volume đó **rỗng** và mọi script (`vitest`, `nest`)
# đều không tồn tại — `npm test` thoát 127 `vitest: not found`. Vì `docker compose run
# <service> npm test` thay thế `command` chứ không thay `entrypoint`, việc cài dependency
# phải nằm ở entrypoint thì dạng lệnh nào cũng chạy được.
#
# Cài một lần khi thiếu; các lần sau chỉ chạy lệnh được truyền vào.
set -e

if [ ! -d node_modules/vitest ] || [ ! -d node_modules/@nestjs/core ]; then
  echo "[backend-test] node_modules chưa có dependency, chạy npm ci một lần…"
  npm ci
fi

exec "$@"
