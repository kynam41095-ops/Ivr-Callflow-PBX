# Design

## Context

Xem `proposal.md` — Why. Ràng buộc kỹ thuật đang có, đo trên máy này ngày 2026-10-22:

- `frontend/` là git repo riêng, nhánh `develop` @ `30b79cb`, HEAD sạch; `node_modules` đã có nhưng thiếu native binding của `rolldown` và `.bin/*` không có quyền thực thi → test chỉ chạy được trong container.
- Gốc dự án không có `.git`; `openspec/` hiện không thuộc repo nào.
- `frontend/contracts/flow-document.schema.json` giống byte `docs/30-designs/contracts/flow-document.schema.json` (sha256 `f2af8de7…`). Hai chỗ đọc: `src/flow/validate.ts:4` và `src/canvas/issues.ts:1` (đường dẫn `../../contracts/…`), cộng `e2e/builder-inspector.spec.ts:39` và `src/flow/validate.test.ts:100` (đọc file qua `import.meta.url` / `path.join`).

## Goals / Non-Goals

**Goals:**

- Một repo, một remote, `openspec/` được version hoá, contract một bản.
- `services/frontend` dựng được thành image bằng Dockerfile, không cần `node_modules` trên máy host.
- Test giữ nguyên khả năng chạy: 64 unit + 81 e2e.

**Non-Goals:**

- Không thêm service backend, không dựng PostgreSQL, không sửa hành vi giao diện.
- Không hợp nhất lịch sử repo `docs` hay `backend` vào monorepo.
- Không đổi nội dung bất kỳ file `.md` nào thuộc `docs/`.

## Decisions

**1. `git subtree add` để đưa frontend vào, không `filter-repo`, không copy.**

`git subtree add --prefix=services/frontend <remote> develop` giữ nguyên sha của 12 commit hiện có, không viết lại lịch sử remote cũ, và gỡ ra được bằng `git subtree split` nếu cần. `filter-repo` viết lại sha toàn bộ và đòi remote mới ngay; copy mất lịch sử — hai cách sau đắt hơn nhu cầu.

**2. Layout `services/<tên-service>/`.**

Đề bài là nhiều service build bằng Dockerfile; `services/` đặt tên theo đơn vị triển khai. Không dùng `apps/` + `packages/` vì chưa có package dùng chung nào để tách, thêm tầng rỗng bây giờ là thừa.

**3. Contract ở `contracts/` gốc, frontend import trực tiếp — không sinh bản copy.**

Sinh bản copy lúc build là dựng lại đúng lỗi đang sửa (hai bản, lệch âm thầm). Cái giá: đường dẫn tương đối sâu `../../../../contracts/flow-document.schema.json` và Vite phải cho phép đọc ngoài `root`.

- Gom đường dẫn vào **một** module `services/frontend/src/contracts.ts` để chỉ một chỗ biết vị trí; `validate.ts` và `issues.ts` import từ đó.
- `vite.config.ts` thêm `server.fs.allow: ["../.."]` cho dev server và test e2e.
- Dockerfile build với **context = gốc repo** để `COPY contracts` và `COPY services/frontend` cùng vào stage build.
- Test sha256 (`TC-FLOW-014`) đổi sang đọc `contracts/flow-document.schema.json` ở gốc; `e2e/builder-inspector.spec.ts` tính lại đường dẫn từ `frontendRoot` lên hai cấp.

**4. Dockerfile multi-stage: `node:24-bookworm-slim` build → `nginx:1.29-alpine` phục vụ tĩnh.**

Build tách khỏi runtime để image cuối không mang toolchain. Không dùng `vite preview` trong production (server phát triển, không có cache header, không nén sẵn). Không dùng `node:24-alpine` ở stage build vì `npm ci` với native binding của `rolldown` cần glibc — đúng loại lỗi đã gặp trên host.

**5. `compose.yaml`: service `frontend` build từ Dockerfile; test e2e thành profile riêng.**

Service `frontend` bỏ image Playwright, bỏ `npm ci` lúc khởi động. Profile `test` giữ image `mcr.microsoft.com/playwright:v1.63.0-noble` (tag khớp `@playwright/test` 1.63.0) và mount **cả** `services/frontend` lẫn `contracts/`, giữ volume `node_modules` riêng — đó là cách duy nhất đã chứng minh chạy xanh trên máy này.

**6. `AGENTS.md` viết lại, không giữ quy tắc cũ.**

Bỏ: yêu cầu đọc `docs/README.md`, mã `FR-*`/`TC-*` ổn định, cập nhật `docs/10-requirements` mỗi khi sửa code. Giữ: tiếng Việt cho nội dung tự nhiên, bỏ qua repo ngoài. Thêm: `openspec/specs/` là nguồn sự thật về hành vi đã chạy; hành vi chưa có thì mô tả bằng `openspec/changes/`; **chỉ repo gốc có git — không `git init` hay `.git` trong bất kỳ thư mục service nào**.

**7. Chỉ một `.git` ở gốc; gỡ mọi repo lồng và chuyển thư mục cũ ra ngoài.**

Hiện có ba `.git` lồng: `frontend/.git`, `backend/.git`, `docs/.git`. Nếu để nguyên, git coi chúng là embedded repo, `git add` bỏ qua nội dung và cảnh báo — repo gốc sẽ thiếu file mà không ai thấy.

- `services/frontend` sinh từ `git subtree add` → không mang `.git` sang. Thư mục `frontend/` cũ (kèm `.git`) bị xoá sau khi subtree xong; đó là bản sao duy nhất của remote `frontend` tại `30b79cb`.
- `docs/` và `backend/` **không** thuộc monorepo nên được **chuyển ra ngoài** thư mục gốc (`../IVR-Callflow-PBX-archive/`), không xoá: `docs` còn một thư mục chưa commit là `30-designs/phase-01/` chỉ tồn tại trên máy này, xoá là mất; `backend` rỗng nhưng giữ lại `.git` để tra remote.
- Sau khi xong: `find . -name .git -not -path './.git'` phải rỗng.

Không dùng `git rm --cached` hay `.gitignore` để "ẩn" repo lồng — cả hai đều để `.git` nằm trong working tree, trái yêu cầu một repo gốc duy nhất.

## Risks / Trade-offs

- **[Đường dẫn sâu dễ sai khi đổi layout lần nữa]** → gom vào `src/contracts.ts`; test sha256 đỏ ngay nếu trỏ sai.
- **[`git subtree add` cần working tree ở gốc sạch]** → bước 0 chuyển `docs/` và `backend/` ra ngoài trước khi `git init`; `frontend/node_modules` đã bị `.gitignore` chặn.
- **[Working tree `frontend` đang "bẩn" 68 file]** → đo ngày 2026-10-22: 20.280 dòng thêm và 20.280 dòng xoá, `git diff --ignore-all-space` rỗng → chỉ là CRLF→LF, không có nội dung nào khác remote `30b79cb`. Không cần bảo toàn; `git subtree add` lấy từ remote nên nội dung đúng.
- **[`docs/30-designs/phase-01/` chưa từng commit]** → chuyển nguyên `docs/` ra `../IVR-Callflow-PBX-archive/`, không xoá.
- **[Image build khác môi trường dev ở chỗ import ra ngoài `root`]** → Dockerfile dùng chung context gốc; nếu `vite build` phàn nàn `fs.allow`, sửa ở `vite.config.ts` chứ không chép schema.
- **[Test sha256 giữ chuỗi `831b0fe` trong tên test]** → giữ nguyên tên test làm mốc lịch sử, chỉ đổi đường dẫn đọc; không đổi giá trị kỳ vọng vì file không đổi byte.
- **[Remote `frontend` tiếp tục nhận commit sau khi chuyển]** → ghi trong `AGENTS.md`: sửa mã chỉ ở monorepo; remote cũ đóng băng.

## Migration Plan

Remote `app-business` **đã có** một commit `e01442f Initial commit` chỉ chứa `README.md` (kiểm bằng `git ls-remote` + clone nông ngày 2026-10-22), nên dựng trên nền đó thay vì `git init` rỗng — không dùng `git push --force`.

0. **Chuẩn bị, trước khi có git ở gốc:** `mkdir -p ../IVR-Callflow-PBX-archive` rồi `mv docs ../IVR-Callflow-PBX-archive/docs` và `mv backend ../IVR-Callflow-PBX-archive/backend`. Hai thư mục này mang `.git` riêng; để lại trong gốc là repo lồng. `docs/30-designs/phase-01/` chưa từng commit nên phải chuyển, không xoá.
1. `git init` ở gốc, `git remote add origin https://gitlab19.mitek.vn/ivr-callflow-pbx/app-business.git`, `git fetch origin`, `git switch -c main origin/main` để lịch sử bắt đầu từ `e01442f`; thêm `.gitignore` (`node_modules/`, `dist/`, `test-results/`, `playwright-report/`), commit khung `openspec/` + `contracts/` + `AGENTS.md` + `compose.yaml` + `README.md` (ghi đè `README.md` của remote).
2. `git subtree add --prefix=services/frontend <remote frontend> develop`. Remote `frontend` đang ở `30b79cb`, trùng commit đã dùng để viết baseline spec. Subtree nhập cây file, không nhập `.git`.
3. Xoá thư mục `frontend/` cũ (kèm `frontend/.git`) sau khi đã đối chiếu `git subtree` cho ra nội dung tương đương; kiểm `find . -name .git -not -path './.git'` rỗng.
4. Chuyển `contracts/flow-document.schema.json` từ `services/frontend/contracts/` lên gốc (file đã có ở bước 1, nội dung giống byte); xoá `services/frontend/contracts/`; sửa 4 chỗ đọc đường dẫn; thêm `src/contracts.ts`; chỉnh `vite.config.ts`.
5. Thêm `services/frontend/Dockerfile`, sửa `compose.yaml`.
6. Viết lại `AGENTS.md`; điền `openspec/config.yaml` `context`.
7. Nghiệm thu: `docker build` thành công; `docker compose --profile test run --rm frontend-test npm test` xanh 64 + 81; `docker run` image cuối trả trang chủ.
8. `git push -u origin main` (fast-forward từ `e01442f`); đóng băng hai remote `frontend`, `docs`.

**Rollback:** `frontend` và `docs` không bị sửa trong suốt quá trình nên vẫn dùng được nguyên trạng; nếu cần bỏ monorepo, `git push --force origin e01442f:main` đưa remote `app-business` về commit khởi tạo.

## Open Questions

Không có.
