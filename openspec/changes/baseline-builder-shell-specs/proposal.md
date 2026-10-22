# Proposal

## Why

`openspec/specs/` đang rỗng, còn bộ tài liệu cũ mô tả 34 yêu cầu mà **0 yêu cầu nào hoàn thành** (`docs/10-requirements/requirements.md`), trong khi repo `frontend` đã có một nền giao diện Builder chạy thật với 64 unit test và 81 e2e test xanh (đo lại 2026-10-22 trong container `mcr.microsoft.com/playwright:v1.63.0-noble`). Không có nguồn sự thật nào mô tả đúng cái đang chạy; muốn nối backend mà không biết chắc hôm nay hệ thống làm được gì.

## What Changes

- Ghi **8 capability spec** mô tả hành vi đã có bằng chứng trong `frontend/src` + `frontend/e2e`, mỗi requirement kèm scenario lấy từ hành vi đã xanh.
- Requirement ghi thẳng giới hạn thật: dữ liệu chỉ trong bộ nhớ trình duyệt (tải lại trang mất), không xác thực, không tenant, không ban hành, không tải file.
- **Không** đưa vào spec: 33 yêu cầu chưa có code, kiến trúc đích, 25 ràng buộc, rủi ro, hạng mục đo V1–V8, contract API của máy chủ chưa tồn tại. Những phần đó bị loại khỏi repo theo quyết định ngày 2026-10-22; lịch sử còn ở remote `docs`.
- Bỏ mã `FR-*`/`TC-*` khỏi nguồn sự thật: danh tính requirement là tên requirement, danh tính test là tên scenario. Test hiện có giữ nguyên mã trong tên (không sửa test trong change này), nhưng spec không phụ thuộc mã đó.

## Capabilities

### New Capabilities

- `builder-shell`: điều hướng hash giữa màn quản lý đầu số và trình dựng, tải dữ liệu trình dựng, header hiện phiên bản đang mở, đường lỗi có thử lại.
- `flow-canvas`: palette sáu loại bước, kéo thả tạo node, thẻ node, cạnh nhánh dự phòng, minimap và xoá bằng bàn phím.
- `node-inspector`: trường chỉnh sửa theo loại bước, bản đồ phím, khung giờ cho bước Điều kiện theo lịch.
- `draft-authoring`: lưu nháp, trạng thái đã lưu/chưa lưu, sinh phiên bản nháp mới, và giới hạn dữ liệu chỉ trong bộ nhớ.
- `flow-validation`: kiểm hai lớp (hình dạng theo schema, đồ thị nhánh) và cách hiện lỗi trên canvas.
- `version-history`: drawer phiên bản, nhãn trạng thái, khôi phục phiên bản thành nháp mới.
- `number-management`: màn quản lý đầu số, thống kê, tìm kiếm, tạo đầu số, tạo kịch bản mới.
- `visual-theme`: bộ token CSS dùng chung và ràng buộc màn hình phải dùng token.

### Modified Capabilities

Không có. `openspec/specs/` đang rỗng — đây là baseline đầu tiên.

## Impact

- `openspec/specs/**`: 8 file spec mới, không đụng `services/frontend` và không sửa test.
- Về sau, mọi thay đổi hành vi (nối HTTP thật, gỡ modal tạo đầu số, thêm ban hành) phải là một change sửa delta trên các capability này, không sửa thẳng spec.
- Phụ thuộc: `monorepo-hoa` cần xong trước để đường dẫn `contracts/flow-document.schema.json` trong `flow-validation` đúng chỗ.
