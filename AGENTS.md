# Quy tắc làm việc — IVR-Callflow-PBX

## Nguồn sự thật về hành vi

- `openspec/specs/` mô tả hành vi **đã có trong code**: chỉ ghi capability chạy được, kiểm được.
- Hành vi **chưa có** được mô tả bằng `openspec/changes/<change>/`. Change chưa apply không phải feature đã triển khai.
- Code và spec lệch nhau: nêu rõ cả hai nguồn, xác minh ý định, rồi mới sửa phần liên quan — không âm thầm chọn bên đúng.

## Cấu trúc monorepo

- Mỗi app ở `apps/<app>/` (`apps/frontend`, `apps/backend`).
- **Chỉ repo gốc có git.** Không chạy `git init` và không tạo `.git` trong `apps/` hay bất kỳ thư mục con nào; mọi commit đi qua repo gốc.
- Contract dùng chung ở `contracts/` tại gốc repo, **một bản duy nhất**. Không chép bản sao vào app — import trực tiếp (frontend: `apps/frontend/src/contracts.ts`).
- Mỗi app build bằng Dockerfile riêng, build context là gốc repo để lấy được `contracts/`. Ứng dụng dựng bằng `compose.yaml`; test chạy qua profile `test`.

## Quy ước module backend

- Backend là **modular monolith**: một miền nghiệp vụ = một module dưới `apps/backend/src/modules/<domain>/`, tự khai `controller`/`provider` của mình.
- `AppModule` **chỉ `imports`** các module con, không khai `controllers` trực tiếp.
- Không tạo thư mục miền rỗng: thư mục rỗng không kiểm được gì và dễ gây cảm giác nghiệp vụ đã có.
- Hàm thuần đọc biến môi trường đặt ở `apps/backend/src/config/` để test được mà không cần dựng app.
- Backend chạy **ESM** (`"type": "module"`): import nội bộ phải ghi đuôi `.js`, thiếu là lỗi runtime `ERR_MODULE_NOT_FOUND`.

## TypeScript bị ghim ở 6 cho tới khi Nest hỗ trợ 7

- `typescript` của backend (và frontend) để `~6.0.3`. **Không** nâng riêng backend lên 7.
- Lý do: Nest CLI 12 từ chối TypeScript 7 vì **TS 7 chưa có compiler API** — TS 7.0 chỉ phát hành binary `tsc`, còn `nest build` cần API lập trình (thông báo trong `@nestjs/cli/lib/ui/errors.js` nói compiler API dự kiến trở lại ở 7.1). Chỉ CLI của Nest vướng, runtime và decorator metadata của TS 7 vẫn chạy.
- Hệ quả kéo theo: `typescript-eslint` của frontend khai peer `typescript >=4.8.4 <6.1.0`, nên frontend cũng không được nâng lên TS 7.
- Khi Nest CLI hỗ trợ TS 7: nâng `typescript` của **cả hai** app cùng lúc với `typescript-eslint` của frontend, rồi chạy lại `npm run build` của từng app.

## Cổng của backend

- `PORT` là cổng tiến trình lắng nghe **bên trong container**. Không đặt → `3000`; có mặt nhưng không phải số nguyên `1`–`65535` (kể cả chuỗi rỗng) → in lỗi, thoát mã khác `0`, **không** mở cổng nào.
- Đừng viết `process.env.PORT ?? 3000`: với `PORT=abc`, Node tạo Unix socket tên `abc` và app báo khởi động thành công trong khi không có cổng TCP nào. Dùng `resolvePort` ở `apps/backend/src/config/port.ts`.
- `BACKEND_PORT` chỉ là cổng công bố ra máy host trong `compose.yaml`, không phải biến của tiến trình.

## Remote

- `origin` = `https://github.com/kynam41095-ops/Ivr-Callflow-PBX.git` — remote duy nhất của monorepo. Nhánh chính là `develop`.
- Các remote GitLab cũ (`gitlab19.mitek.vn/ivr-callflow-pbx/{app-business,frontend,docs}.git`) đã **đóng băng**: chỉ đọc, không nhận commit mới, và không còn cấu hình trong clone. Sửa mã chỉ qua `origin`.
- Không dùng `glab` và không push tới `gitlab19.mitek.vn`; mọi thao tác Git đi qua `origin` bằng `git`/`gh`.
- Thư mục `docs/` cũ và `backend` (rỗng) đã chuyển ra `../IVR-Callflow-PBX-archive/` trên máy này; `docs/` không còn là nguồn chuẩn.

## Ngôn ngữ

- Nội dung tự nhiên (spec, README, commit message) viết tiếng Việt UTF-8 có dấu; giữ nguyên tên file, identifier và thuật ngữ kỹ thuật.
- Chưa biết thì ghi `TBD` hoặc câu hỏi mở — **không bịa** business rule, tên bảng, con số hay kết quả test.

## Kiểm trước khi báo xong

- `docker compose --profile test run --rm frontend-test npm test`
- `docker compose --profile test run --rm backend-test npm test`
- `docker compose build frontend backend`
- Không còn đường dẫn trỏ tới layout cũ (thư mục `services`) trong mã và tài liệu; lịch sử trong `openspec/changes/**` thì giữ nguyên.
