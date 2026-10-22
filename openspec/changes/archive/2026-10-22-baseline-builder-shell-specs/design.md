# Design

## Context

Change thuần tài liệu: `openspec/specs/` đang rỗng, còn bộ docs cũ đã ra khỏi repo (chuyển tới `../IVR-Callflow-PBX-archive/docs`, remote `docs` đóng băng). Thứ đang chạy là `services/frontend` trong monorepo: 64 unit + 81 e2e xanh, đo 2026-10-22 trong container Playwright 1.63.0, tại commit merge `fecc264`. Contract dùng chung nằm ở `contracts/flow-document.schema.json` (một bản duy nhất từ change `monorepo-hoa`).

Ràng buộc ảnh hưởng cách làm:

- Docs cũ mô tả 34 yêu cầu nhưng **0 yêu cầu hoàn thành** — nó là ý định, không phải hiện trạng, nên không dùng làm nguồn.
- Change này không sửa `services/frontend` và không sửa test; mọi requirement phải có bằng chứng trong code + test hiện có.
- 8 capability trong proposal là đơn vị của spec; danh sách này không đổi trong lúc apply.

## Goals / Non-Goals

**Goals:**

- 8 capability spec mô tả hành vi đã có, mỗi requirement kèm scenario lấy từ hành vi đã xanh.
- Chốt bằng chứng và chiều sửa để các change sau không phải tranh luận lại "spec đúng hay code đúng".
- Ghi thẳng giới hạn thật của hệ thống hôm nay: dữ liệu chỉ trong bộ nhớ trình duyệt, không xác thực, không tenant, không ban hành, không tải file.

**Non-Goals:**

- Không đưa 33 yêu cầu chưa có code, kiến trúc đích, ràng buộc, contract API máy chủ chưa tồn tại (những phần đó đã bị loại khỏi repo ngày 2026-10-22).
- Không đổi hành vi, không sửa code, không sửa test để spec khớp.
- Không đưa mã `FR-*`/`TC-*` vào spec.

## Decisions

**1. Bằng chứng là code + test xanh tại `fecc264`, không phải docs cũ.**

Requirement chỉ được viết khi chỉ ra được hành vi trong `services/frontend` và test đang xanh tương ứng. Docs cũ bị loại vì 0/34 yêu cầu hoàn thành — dùng nó sẽ biến spec thành danh sách mong muốn, đúng thứ proposal muốn xoá.

**2. Chiều sửa: spec theo code.**

Khi scenario và test lệch nhau, sửa spec (hoặc ghi nhãn "chưa có test"), không sửa test và không xoá scenario. Hệ quả: nếu code sai thì sửa code bằng một change riêng — baseline này không phải nơi sửa lỗi.

**3. Bảng ánh xạ scenario → test đặt ở cuối `tasks.md`, không nằm ở design.**

Task 2.1 cho phép `tasks.md` hoặc `design.md`. Chọn `tasks.md` vì bảng đó là dữ liệu kiểm của lần apply này, không phải quyết định kiến trúc; design giữ quyết định, tasks giữ bằng chứng — không hai nơi cùng một nội dung.

**4. `openspec validate --strict` là cổng hình thức.**

Ngưỡng: mô tả requirement ≤ 500 ký tự, scenario đúng 4 dấu `#`, mỗi requirement có ít nhất một scenario. Không nới ngưỡng; nếu vướng thì viết gọn lại văn, không tắt cảnh báo.

**5. Danh tính lấy từ tên, không từ mã.**

Requirement nhận diện bằng `### Requirement:` và scenario bằng `#### Scenario:`. Test hiện có giữ mã trong tên (không sửa trong change này) nhưng spec không tham chiếu mã, để lần đổi tên test không kéo theo sửa spec.

## Risks / Trade-offs

- **[Viết tay 30 requirement dễ lọt hành vi chưa tồn tại]** → chặn bằng hai lệnh grep ở task 3.1 (từ khoá ban hành/xác thực/tenant/tải lên/máy chủ) và 3.2 (tên class/hàm/thư viện nội bộ).
- **[Baseline suy ra từ test có thể bỏ sót hành vi không có test]** → ghi nhãn "chưa có test" kèm lý do, không xoá scenario và không hạ yêu cầu cho vừa test.
- **[Archive ghi 30 requirement vào `openspec/specs/`]** → từ đó mọi thay đổi hành vi phải là change delta trên capability, không sửa thẳng spec; nếu sửa thẳng thì mất dấu vết nguồn.
- **[Phụ thuộc `monorepo-hoa`]** → đã xong: monorepo ở gốc repo, `contracts/flow-document.schema.json` tồn tại, test chạy bằng `docker compose --profile test run --rm frontend-test npm test`.
- **[Scenario dẫn đường dẫn tới file cụ thể dễ mục]** → chỉ `flow-validation` nhắc `contracts/flow-document.schema.json`, là đường dẫn ổn định của monorepo; đã kiểm ở task 4.2.
