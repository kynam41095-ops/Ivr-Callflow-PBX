# number-management Specification

## Purpose

Màn quản lý đầu số: xem toàn bộ đầu số đang có, tìm nhanh, và tạo mới đầu số hoặc kịch bản.

## Requirements

### Requirement: Bảng đầu số và liên kết tới kịch bản

Màn quản lý đầu số SHALL hiện bảng bốn cột: Đầu số, Nhà mạng, Kịch bản, Trạng thái. Ô kịch bản SHALL không bao giờ rỗng: ghi `Chưa có kịch bản` khi đầu số chưa gán, ghi `Không tìm thấy kịch bản đang chạy` khi không tra được, và hiện tên kịch bản dạng liên kết mở trình dựng khi tra được. Cột Kịch bản SHALL hiện số phiên bản đang chạy hoặc `chưa publish`, số node, và dấu `có bản nháp chưa publish` khi kịch bản có bản nháp.

#### Scenario: Đầu số chưa gán kịch bản

- **WHEN** bảng có một đầu số chưa có phiên bản đang chạy
- **THEN** ô kịch bản ghi `Chưa có kịch bản`
- **AND** trạng thái ghi `Nháp`

#### Scenario: Đầu số có kịch bản đang chạy

- **WHEN** đầu số trỏ tới một phiên bản đang chạy
- **THEN** ô kịch bản hiện tên kịch bản dạng liên kết
- **AND** trạng thái ghi `Hoạt động`

#### Scenario: Bấm tên kịch bản

- **WHEN** người dùng bấm tên kịch bản trong bảng
- **THEN** trình dựng của kịch bản đó mở ra

### Requirement: Thống kê và tìm kiếm đầu số

Màn quản lý đầu số SHALL hiện ba thẻ thống kê Tổng đầu số, Đang hoạt động, Bản nháp chờ publish, đếm trên toàn danh sách. Ô tìm kiếm SHALL lọc theo số đầu số hoặc tên kịch bản, và SHALL không làm đổi các con số thống kê.

#### Scenario: Tìm theo tên kịch bản

- **WHEN** người dùng gõ một phần tên kịch bản vào ô tìm kiếm
- **THEN** bảng chỉ còn các dòng khớp
- **AND** ba thẻ thống kê giữ nguyên giá trị

#### Scenario: Đang tải

- **WHEN** dữ liệu chưa tải xong
- **THEN** giá trị ba thẻ thống kê hiện `—`

### Requirement: Tạo đầu số qua hộp thoại

Hệ thống SHALL cho tạo đầu số qua hộp thoại có ô nhập số điện thoại và hai nút Huỷ, Tạo. Số SHALL được cắt khoảng trắng hai đầu và phải dài từ 1 đến 32 ký tự; số đã tồn tại SHALL bị từ chối. Lỗi SHALL hiện ngay trong hộp thoại ở vùng `role="alert"`, và hộp thoại SHALL không gửi trùng khi người dùng bấm hai lần. Huỷ hoặc bấm Escape SHALL đóng hộp thoại mà không tạo đầu số.

#### Scenario: Tạo thành công

- **WHEN** người dùng nhập một số mới và bấm Tạo
- **THEN** hộp thoại đóng và bảng có thêm dòng đầu số đó

#### Scenario: Số quá dài

- **WHEN** người dùng nhập số dài hơn 32 ký tự
- **THEN** hộp thoại hiện lỗi về độ dài và vẫn mở
- **AND** bảng không có dòng mới

#### Scenario: Số đã tồn tại

- **WHEN** người dùng nhập số đã có trong bảng
- **THEN** hộp thoại hiện lỗi nêu số đã tồn tại

#### Scenario: Bấm Tạo hai lần

- **WHEN** người dùng bấm Tạo hai lần liên tiếp cho cùng một số
- **THEN** chỉ một đầu số được tạo

#### Scenario: Huỷ hộp thoại

- **WHEN** người dùng bấm Huỷ hoặc bấm Escape
- **THEN** hộp thoại đóng và không có đầu số nào được tạo

### Requirement: Tạo kịch bản mới từ trình dựng

Nút Kịch bản mới SHALL tạo một kịch bản tên `Kịch bản mới` kèm một bản nháp trống chứa sẵn bước Bắt đầu, rồi mở trình dựng của kịch bản đó. Nếu tạo thất bại, hệ thống SHALL hiện lỗi tại chỗ và không điều hướng.

#### Scenario: Tạo kịch bản thành công

- **WHEN** người dùng bấm Kịch bản mới
- **THEN** hệ thống mở trình dựng của kịch bản mới
- **AND** canvas có đúng một bước Bắt đầu

#### Scenario: Tạo kịch bản lỗi

- **WHEN** tạo kịch bản thất bại
- **THEN** lỗi hiện ở vùng `role="alert"` trên trình dựng
- **AND** hash không đổi
