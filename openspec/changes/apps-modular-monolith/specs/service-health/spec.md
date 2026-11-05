# Spec Delta

## Purpose

Dịch vụ backend phải khởi động được và tự báo trạng thái sẵn sàng qua HTTP, để khung dịch vụ
kiểm chứng được trước khi có nghiệp vụ, và để nơi vận hành biết tiến trình còn sống.

## ADDED Requirements

### Requirement: Dịch vụ khởi động trên cổng cấu hình được

Dịch vụ backend SHALL lắng nghe HTTP trên cổng TCP lấy từ biến môi trường `PORT`; khi biến này
không được đặt, dịch vụ SHALL dùng cổng `3000`.

#### Scenario: Không đặt PORT

- **WHEN** dịch vụ khởi động mà biến môi trường `PORT` không được đặt
- **THEN** dịch vụ lắng nghe trên cổng TCP `3000`
- **AND** gọi `GET /health` trên cổng đó nhận phản hồi thành công

#### Scenario: Đặt PORT là số hợp lệ

- **WHEN** dịch vụ khởi động với `PORT` bằng một số nguyên còn trống trong khoảng `1`–`65535`
- **THEN** dịch vụ lắng nghe trên đúng cổng đó
- **AND** không lắng nghe trên cổng `3000`

### Requirement: PORT không hợp lệ làm dịch vụ dừng, không lắng nghe sai chỗ

Khi `PORT` có mặt nhưng không phải số nguyên hợp lệ (chuỗi rỗng, chỉ khoảng trắng, có ký tự không
phải chữ số, hoặc ngoài khoảng `1`–`65535`), dịch vụ SHALL dừng quá trình khởi động với mã thoát
khác `0` và SHALL NOT mở bất kỳ cổng TCP hay Unix socket nào.

#### Scenario: PORT rỗng

- **WHEN** dịch vụ khởi động với `PORT` là chuỗi rỗng
- **THEN** quá trình khởi động thất bại với mã thoát khác `0`
- **AND** không có cổng TCP `3000` nào được mở

#### Scenario: PORT không phải số

- **WHEN** dịch vụ khởi động với `PORT` là chuỗi không phải số, ví dụ `abc`
- **THEN** quá trình khởi động thất bại với mã thoát khác `0`
- **AND** dịch vụ không tạo Unix socket mang tên `abc`
- **AND** không có cổng TCP nào được mở

#### Scenario: PORT ngoài khoảng

- **WHEN** dịch vụ khởi động với `PORT` bằng `70000`
- **THEN** quá trình khởi động thất bại với mã thoát khác `0`

### Requirement: Điểm kiểm tra sức khoẻ trả trạng thái sẵn sàng

Dịch vụ backend SHALL trả về `GET /health` với mã `200` và một thân JSON có trường `status` bằng
`"ok"`, không đòi tham số hay xác thực.

#### Scenario: Gọi health khi dịch vụ đang chạy

- **WHEN** dịch vụ đã khởi động xong và nhận `GET /health`
- **THEN** phản hồi có mã `200`
- **AND** thân phản hồi là JSON với `status` bằng `"ok"`

#### Scenario: Đường dẫn không tồn tại

- **WHEN** dịch vụ nhận `GET` tới một đường dẫn chưa khai báo
- **THEN** phản hồi có mã `404`
