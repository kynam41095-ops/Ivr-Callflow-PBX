#!/usr/bin/env bash
# Chạy test của frontend bằng container đúng như AGENTS.md, rồi dọn artifact do container
# (chạy bằng root) ghi vào worktree — thứ khiến `orca worktree rm` sau đó fail Permission denied.
#
#   scripts/run-frontend-tests.sh           # mặc định: npm test
#   scripts/run-frontend-tests.sh npm ci    # lệnh khác, cùng cơ chế dọn dẹp
#
# Test vẫn chạy trong container như cũ; chỉ khác là sau khi xong, các thư mục artifact
# (test-results/, playwright-report/) được xoá bằng chính container nên không cần sudo.
set -uo pipefail

REPO_DIR="${REPO_DIR:-$(git rev-parse --show-toplevel)}"
cd "$REPO_DIR" || exit 2

COMMAND=("$@")
if [ ${#COMMAND[@]} -eq 0 ]; then
  COMMAND=(npm test)
fi

ARTIFACTS=(services/frontend/test-results services/frontend/playwright-report)

cleanup() {
  local existing=()
  for dir in "${ARTIFACTS[@]}"; do
    [ -e "$REPO_DIR/$dir" ] && existing+=("$dir")
  done
  [ ${#existing[@]} -eq 0 ] && return 0
  docker run --rm -v "$REPO_DIR:/repo" alpine:3 sh -c \
    "cd /repo && rm -rf $(printf '%q ' "${existing[@]}")" >/dev/null 2>&1 || \
    echo "Cảnh báo: chưa dọn được ${existing[*]}" >&2
}
trap cleanup EXIT

docker compose --profile test run --rm frontend-test "${COMMAND[@]}"
