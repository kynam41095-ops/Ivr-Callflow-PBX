# Quy tắc làm việc — IVR-Callflow-PBX

## Nguồn sự thật về hành vi

- `openspec/specs/` mô tả hành vi **đã có trong code**: chỉ ghi capability chạy được, kiểm được.
- Hành vi **chưa có** được mô tả bằng `openspec/changes/<change>/`. Change chưa apply không phải feature đã triển khai.
- Code và spec lệch nhau: nêu rõ cả hai nguồn, xác minh ý định, rồi mới sửa phần liên quan — không âm thầm chọn bên đúng.

## Cấu trúc monorepo

- Mỗi service ở `services/<service>/`.
- **Chỉ repo gốc có git.** Không chạy `git init` và không tạo `.git` trong `services/` hay bất kỳ thư mục con nào; mọi commit đi qua repo gốc.
- Contract dùng chung ở `contracts/` tại gốc repo, **một bản duy nhất**. Không chép bản sao vào service — import trực tiếp (frontend: `services/frontend/src/contracts.ts`).
- Mỗi service build bằng Dockerfile riêng, build context là gốc repo để lấy được `contracts/`. Ứng dụng dựng bằng `compose.yaml`; test chạy qua profile `test`.

## Remote

- `origin` = `https://gitlab19.mitek.vn/ivr-callflow-pbx/app-business.git` — remote duy nhất của monorepo.
- Remote `frontend` (`https://gitlab19.mitek.vn/ivr-callflow-pbx/frontend.git`, nhánh `develop` @ `30b79cb`) và `docs` (`https://gitlab19.mitek.vn/ivr-callflow-pbx/docs.git`) đã **đóng băng**: chỉ đọc, không nhận commit mới. Sửa mã chỉ ở monorepo.
- Thư mục `docs/` cũ và `backend` (rỗng) đã chuyển ra `../IVR-Callflow-PBX-archive/` trên máy này; `docs/` không còn là nguồn chuẩn.

## Ngôn ngữ

- Nội dung tự nhiên (spec, README, commit message) viết tiếng Việt UTF-8 có dấu; giữ nguyên tên file, identifier và thuật ngữ kỹ thuật.
- Chưa biết thì ghi `TBD` hoặc câu hỏi mở — **không bịa** business rule, tên bảng, con số hay kết quả test.

## Kiểm trước khi báo xong

- `docker compose --profile test run --rm frontend-test npm test`
- `docker compose build frontend`
- Không còn đường dẫn trỏ tới thư mục `frontend/` cũ trong mã và tài liệu.
