# Spec Delta

## Purpose

Xem lại các phiên bản của một kịch bản và khôi phục một phiên bản cũ thành bản nháp mới.

## ADDED Requirements

### Requirement: Danh sách phiên bản trong drawer

Drawer phiên bản SHALL liệt kê mọi phiên bản của kịch bản theo thứ tự số phiên bản giảm dần. Mỗi dòng SHALL hiện số phiên bản, nhãn trạng thái `Nháp` / `Đang chạy` / `Lưu trữ`, tên phiên bản, ghi chú, người tạo và thời điểm tạo; phiên bản đang mở trên canvas SHALL được đánh dấu `Đang mở`.

#### Scenario: Mở drawer

- **WHEN** người dùng bấm nút `Phiên bản · <số>` trên đầu trình dựng
- **THEN** drawer hiện danh sách phiên bản, mới nhất ở trên
- **AND** phiên bản đang mở có dấu `Đang mở`

#### Scenario: Nhãn trạng thái đúng

- **WHEN** drawer hiện một phiên bản đang chạy và một phiên bản nháp
- **THEN** phiên bản đang chạy mang nhãn `Đang chạy`, phiên bản nháp mang nhãn `Nháp`

### Requirement: Lỗi đọc danh sách phiên bản có đường thử lại

Đọc danh sách phiên bản lỗi SHALL hiện thông báo kèm nút thử lại trong drawer, và SHALL ẩn nút khôi phục để không tạo nháp trùng.

#### Scenario: Đọc danh sách lỗi

- **WHEN** nguồn danh sách phiên bản trả lỗi
- **THEN** drawer hiện thông báo lỗi kèm nút thử lại
- **AND** không có nút khôi phục nào hiện

#### Scenario: Thử lại thành công

- **WHEN** nguồn dữ liệu hoạt động trở lại và người dùng bấm thử lại
- **THEN** drawer hiện danh sách phiên bản bình thường

### Requirement: Khôi phục phiên bản thành bản nháp mới

Với bất kỳ phiên bản nào trong danh sách, hệ thống SHALL cho khôi phục: tạo một phiên bản nháp mới từ tài liệu của phiên bản đó, không sửa phiên bản gốc, rồi nạp bản nháp mới lên canvas và làm mới danh sách. Bản nháp khôi phục SHALL được đặt tên `Nháp từ v<số>` và ghi chú nêu phiên bản nguồn. Lỗi khôi phục SHALL hiện trong drawer, và hai thao tác lưu nháp / khôi phục SHALL không chạy chồng nhau.

#### Scenario: Khôi phục phiên bản lưu trữ

- **WHEN** người dùng bấm Khôi phục trên một phiên bản lưu trữ
- **THEN** một phiên bản nháp mới được tạo với tên `Nháp từ v<số phiên bản nguồn>`
- **AND** canvas nạp tài liệu của bản nháp mới
- **AND** phiên bản nguồn giữ nguyên trạng thái và nội dung

#### Scenario: Không chạy chồng với lưu nháp

- **WHEN** người dùng bấm Khôi phục trong lúc đang lưu nháp
- **THEN** thao tác khôi phục không bắt đầu
- **AND** không có phiên bản nào được tạo thêm

#### Scenario: Khôi phục lỗi

- **WHEN** khôi phục thất bại
- **THEN** drawer hiện thông báo `Không khôi phục được:` kèm lý do
- **AND** danh sách phiên bản giữ nguyên số dòng
