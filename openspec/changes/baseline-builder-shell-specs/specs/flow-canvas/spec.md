# Spec Delta

## Purpose

Trình dựng kịch bản dạng canvas: chọn loại bước, kéo vào canvas, nối nhánh, đọc nhanh nội dung từng bước và xoá bước bằng bàn phím.

## ADDED Requirements

### Requirement: Palette sáu loại bước

Palette SHALL cung cấp đúng sáu loại bước: Bắt đầu, Phát lời thoại, Menu phím bấm, Chuyển hàng đợi, Kết thúc, Điều kiện theo lịch, mỗi mục có mã hai chữ `ST`, `PL`, `KB`, `QU`, `HG`, `TM`. Palette SHALL mặc định ở trạng thái thu gọn, chỉ hiện mã và không hiện nhãn chữ; mở rộng thì hiện nhãn. Rê chuột lên mục thu gọn SHALL hiện nhãn qua tooltip.

#### Scenario: Palette mặc định thu gọn

- **WHEN** trình dựng nạp xong
- **THEN** palette rộng 56px, chỉ có sáu mã bước
- **AND** không có nhãn chữ nào hiển thị

#### Scenario: Mở rộng palette

- **WHEN** người dùng bấm nút mở rộng palette
- **THEN** palette hiện đủ sáu nhãn tiếng Việt của sáu loại bước

#### Scenario: Kéo một bước vào canvas

- **WHEN** người dùng kéo một mục từ palette và thả vào canvas
- **THEN** canvas thêm đúng một node thuộc loại bước đó

### Requirement: Thẻ node hiện nội dung và trạng thái nhánh

Mỗi node trên canvas SHALL hiện mã node, nhãn loại bước và một dòng tóm tắt nội dung theo loại: tên file âm thanh cho bước Phát lời thoại, tên file kèm thời gian chờ cho Menu, tên hàng đợi cho Chuyển hàng đợi, khung giờ đầu tiên kèm số khung còn lại cho Điều kiện theo lịch. Giá trị không tra được SHALL hiện `—`.

#### Scenario: Tóm tắt bước Phát lời thoại

- **WHEN** node Phát lời thoại trỏ tới file âm thanh có trong danh mục
- **THEN** thẻ node hiện tên file đó
- **AND** trỏ tới file không có trong danh mục thì hiện `—`

#### Scenario: Tóm tắt bước Menu

- **WHEN** node Menu có file nhắc và thời gian chờ
- **THEN** thẻ node hiện `<tên file> · chờ <n>s`

### Requirement: Nhánh dự phòng vẽ khác nhánh thường

Cạnh của nhánh dự phòng — `fallback` của Bắt đầu, `timeout` và `invalid` của Menu — SHALL vẽ nét đứt màu lỗi và giữ nét đứt kể cả khi được chọn; cạnh thường SHALL vẽ nét liền theo màu của loại bước nguồn. Bước Chuyển hàng đợi và Kết thúc SHALL không có điểm nối ra.

#### Scenario: Nhánh dự phòng của bước Bắt đầu

- **WHEN** canvas hiện cạnh nối từ nhánh `fallback` của node Bắt đầu
- **THEN** cạnh đó nét đứt màu lỗi

#### Scenario: Bước không có cổng ra

- **WHEN** node Chuyển hàng đợi hoặc Kết thúc hiện trên canvas
- **THEN** node đó không có điểm nối ra nào

### Requirement: Nền, minimap và điều khiển khung nhìn

Canvas SHALL hiện nền lưới chấm, minimap và bộ điều khiển thu phóng.

#### Scenario: Canvas có đủ ba thành phần

- **WHEN** trình dựng nạp xong
- **THEN** nền lưới chấm, minimap và bộ điều khiển thu phóng cùng hiện

### Requirement: Xoá bước và cạnh bằng bàn phím

Hệ thống SHALL xoá node hoặc cạnh đang được chọn khi người dùng bấm Backspace.

#### Scenario: Xoá node đang chọn

- **WHEN** một node đang được chọn và người dùng bấm Backspace
- **THEN** node đó biến khỏi canvas
- **AND** nháp hiện trạng thái chưa lưu
