# Spec Delta

## Purpose

Dịch vụ backend phải khởi động được và tự báo trạng thái sẵn sàng qua HTTP, để khung dịch vụ
kiểm chứng được trước khi có nghiệp vụ, và để nơi vận hành biết tiến trình còn sống.

## ADDED Requirements

### Requirement: Dịch vụ khởi động trên cổng cấu hình được

Dịch vụ backend SHALL lắng nghe HTTP trên cổng lấy từ biến môi trường `PORT`; khi biến này không
có, dịch vụ SHALL dùng cổng `3000`.

#### Scenario: Không đặt PORT

- **WHEN** dịch vụ khởi động mà biến môi trường `PORT` không được đặt
- **THEN** dịch vụ lắng nghe trên cổng `3000`
- **AND** gọi `GET /health` trên cổng đó nhận phản hồi thành công

#### Scenario: Đặt PORT khác

- **WHEN** dịch vụ khởi động với `PORT` bằng một số còn trống
- **THEN** dịch vụ lắng nghe đúng cổng đó
- **AND** không lắng nghe trên cổng `3000`

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
