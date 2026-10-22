# Tasks

> **Hiệu lực của `AGENTS.md` trong lúc apply:** quy tắc hiện tại bắt đọc `docs/README.md` và cập nhật `docs/10-requirements`. Task 0.2 chuyển `docs/` ra ngoài, nên từ bước đó quy tắc ấy hết hiệu lực — **không** cố cập nhật `docs/` trong suốt change này. `AGENTS.md` được viết lại ở 5.1.

## 0. Chuẩn bị: tách các repo lồng ra khỏi gốc

- [x] 0.1 Ghi lại hiện trạng để không mất gì: `git -C frontend diff --ignore-all-space --stat` phải rỗng (xác nhận 68 file "bẩn" chỉ là CRLF), `git -C docs status --porcelain | grep '^??'` phải thấy `30-designs/phase-01/`. Kiểm: hai lệnh cho đúng kết quả trên.
- [x] 0.2 `mkdir -p ../IVR-Callflow-PBX-archive && mv docs ../IVR-Callflow-PBX-archive/docs` — mang theo `.git` và thư mục `30-designs/phase-01/` chưa commit. Kiểm: `test -d ../IVR-Callflow-PBX-archive/docs/30-designs/phase-01` và `test ! -d docs`.
- [x] 0.3 `mv backend ../IVR-Callflow-PBX-archive/backend` (rỗng, chỉ có `.git` với remote `https://gitlab19.mitek.vn/ivr-callflow-pbx/backend.git`). Kiểm: `test ! -d backend`; `git --git-dir=../IVR-Callflow-PBX-archive/backend/.git remote get-url origin` in đúng URL.

## 1. Khung repo monorepo

- [x] 1.1 `git init` ở gốc dự án, `git remote add origin https://gitlab19.mitek.vn/ivr-callflow-pbx/app-business.git`, `git fetch origin`, `git switch -c main origin/main` (remote đang có `e01442f Initial commit` với `README.md`), tạo `.gitignore` cho `node_modules/`, `dist/`, `test-results/`, `playwright-report/`, `playwright/.cache/`. Kiểm: `git remote get-url origin` in đúng URL; `git log --oneline` có `e01442f`; `git status` không liệt kê `frontend/node_modules` hay file build.
- [x] 1.2 Tạo `README.md` gốc mô tả monorepo, danh sách service hiện có (`frontend`) và lệnh build/test. Kiểm: đọc file, đường dẫn trong README tồn tại thật (`services/frontend/package.json`).
- [x] 1.3 Commit khung ban đầu gồm `openspec/`, `contracts/`, `compose.yaml`, `README.md`. Kiểm: `git log --oneline` có ít nhất một commit; `git ls-files | grep -c openspec` > 0.

## 2. Đưa frontend vào monorepo

- [x] 2.1 `git subtree add --prefix=services/frontend <remote frontend> develop`. Kiểm: `git merge-base --is-ancestor 30b79cb HEAD` exit 0; `git rev-list --count 30b79cb` = 17. (Không đếm bằng `git log -- services/frontend`: history simplification chỉ in commit subtree merge.)
- [x] 2.2 Xác nhận không đổi nội dung: `git diff --stat 30b79cb HEAD:services/frontend` rỗng, và `git rev-parse 30b79cb^{tree}` = `git rev-parse HEAD:services/frontend`. Kiểm: diff không in dòng nào, hai tree sha trùng nhau.
- [x] 2.3 Xoá thư mục `frontend/` cũ, gồm `frontend/.git`; không xoá `services/frontend`. Kiểm: `test ! -d frontend` và `test -f services/frontend/package.json`.
- [x] 2.4 Kiểm chỉ còn một repo: `find . -name .git -not -path './.git'` rỗng, và `test -d .git`. Kiểm: hai lệnh cho đúng kết quả trên.

## 3. Contract một bản duy nhất

- [x] 3.1 Giữ `contracts/flow-document.schema.json` ở gốc (trùng byte bản trong frontend), xoá `services/frontend/contracts/`. Kiểm: `sha256sum contracts/flow-document.schema.json` = `f2af8de7bf049bac87c9a9e4cb80f09ffd8b5133d9a457d16cb1b070fbc2b6d8`; `test ! -d services/frontend/contracts`.
- [x] 3.2 Thêm `services/frontend/src/contracts.ts` là nơi duy nhất biết đường dẫn schema; `src/flow/validate.ts:4` và `src/canvas/issues.ts:1` import từ đó. Kiểm: `grep -rn "flow-document.schema.json" services/frontend/src --include=*.ts | grep -v contracts.ts` chỉ còn comment, không còn dòng `import`.
- [x] 3.3 Sửa `src/flow/validate.test.ts:100` và `e2e/builder-inspector.spec.ts:39` đọc schema ở gốc repo; giữ nguyên giá trị sha256 kỳ vọng và tên test `TC-FLOW-014`. Kiểm: `npx vitest run src/flow/validate.test.ts` xanh trong container test.
- [x] 3.4 `vite.config.ts` thêm `server.fs.allow: ["../.."]`. Kiểm: `npm test` trong container test xanh toàn bộ (64 unit + 81 e2e) ở đường dẫn mới.

## 4. Docker hoá service frontend

- [x] 4.1 Thêm `services/frontend/Dockerfile` multi-stage `node:24-bookworm-slim` → `nginx:1.29-alpine`, build context là gốc repo, `COPY contracts` + `COPY services/frontend`. Kiểm: `docker build -f services/frontend/Dockerfile -t ivr-frontend .` exit 0.
- [x] 4.2 Kiểm image cuối phục vụ được: `docker run --rm -p 8080:80 ivr-frontend` rồi `curl -fsS http://127.0.0.1:8080/` trả HTML có `id="root"`. Kiểm: mã thoát `curl` = 0.
- [x] 4.3 Sửa `compose.yaml`: service `frontend` build từ Dockerfile thay image Playwright; thêm profile `test` dùng image `mcr.microsoft.com/playwright:v1.63.0-noble`, mount `services/frontend` và `contracts/`. Kiểm: `docker compose config` hợp lệ; `docker compose --profile test run --rm frontend-test node ./node_modules/vitest/vitest.mjs run` xanh.
- [x] 4.4 Ghi vào `services/frontend/README.md` cách chạy dev, build image và chạy test bằng compose profile. Kiểm: chạy lại hai lệnh trong README từ trạng thái sạch (`docker compose build frontend`).

## 5. Quy tắc dự án và cấu hình OpenSpec

- [x] 5.1 Viết lại `AGENTS.md`: bỏ quy tắc `docs/` và mã `FR-*`/`TC-*`; ghi `openspec/specs/` là nguồn sự thật về hành vi đã chạy, hành vi chưa có mô tả bằng `openspec/changes/`; ghi **chỉ repo gốc có git, không `git init` trong `services/`**; ghi remote `frontend`/`docs` đã đóng băng. Kiểm: `grep -n "docs/10-requirements\|FR-<DOMAIN>" AGENTS.md` không còn kết quả; `grep -n "git init" AGENTS.md` chỉ xuất hiện trong câu cấm.
- [x] 5.2 Điền `openspec/config.yaml` mục `context`: monorepo, service nằm ở `services/` và **không có git riêng**, build bằng Dockerfile, contract ở `contracts/`, nội dung tự nhiên tiếng Việt. Kiểm: `openspec instructions apply --change monorepo-hoa --json` trả `context` đúng phần vừa thêm (`openspec context` chỉ in working context của root, không in config).

## 6. Nghiệm thu tích hợp và đóng sổ

- [x] 6.1 Chạy toàn bộ kiểm từ trạng thái sạch: `docker compose --profile test run --rm frontend-test npm test` xanh (64 unit + 81 e2e) và `docker build` thành công. Kiểm: log hai lệnh, không có `failed`.
- [x] 6.2 Kiểm không còn tham chiếu đường dẫn cũ trong repo: `grep -rn "frontend/contracts\|docs/30-designs" --include=*.ts --include=*.yaml --include=*.md .` chỉ còn trong `openspec/changes/**` là lịch sử. Kiểm: kết quả nằm ngoài `services/`.
- [x] 6.3 Đẩy monorepo lên `origin` (`https://gitlab19.mitek.vn/ivr-callflow-pbx/app-business.git`) và đánh dấu remote `frontend`, `docs` chỉ đọc. Kiểm: `git push -u origin main` fast-forward từ `e01442f` (không cần `--force`); `git remote -v` chỉ còn `origin` trỏ `app-business`.

## Workflow follow-up

- Archive change này bằng `/openspec-archive-change` sau khi 6.3 xong.
- Change `baseline-builder-shell-specs` được ghi trong repo hiện tại; monorepo dựng tại chỗ nghĩa là change này đã nằm trong repo `app-business` (không cần chép), chỉ cần chạy `openspec validate` sau khi monorepo xong.
