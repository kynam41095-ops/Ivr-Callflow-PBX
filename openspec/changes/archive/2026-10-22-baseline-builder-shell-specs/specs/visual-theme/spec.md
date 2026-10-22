# Spec Delta

## Purpose

Bộ token giao diện dùng chung để mọi màn hình của Builder lấy màu, khoảng cách và kiểu chữ từ cùng một nguồn.

## ADDED Requirements

### Requirement: Bộ token giao diện đầy đủ

Ứng dụng SHALL khai báo bộ 122 biến CSS của bản dựng thử giao diện trong khối `:root`, với đúng tên và đúng giá trị. Bộ biến SHALL được phục vụ từ một nguồn duy nhất mà ứng dụng đọc lúc chạy, không sao chép thành bộ thứ hai.

#### Scenario: Số lượng biến

- **WHEN** đọc biến CSS trên `document.documentElement`
- **THEN** có đủ 122 biến của bộ token
- **AND** giá trị các biến mẫu `--acc` và `--n-start-b` đúng như bộ token quy định

### Requirement: Mọi màn hình dùng chung bộ token

Bộ token SHALL có mặt và giống nhau trên cả ba màn hình: quản lý đầu số, trình dựng và drawer phiên bản. Màn hình SHALL không phát sinh lỗi trang khi hiển thị.

#### Scenario: Đối chiếu từng biến ở ba màn hình

- **WHEN** mở lần lượt màn quản lý đầu số, trình dựng và drawer phiên bản
- **THEN** mọi biến trong bộ token có giá trị giống bộ quy định tại mỗi màn hình
- **AND** không có lỗi trang nào phát sinh

#### Scenario: Biến của loại bước ngoài phạm vi

- **WHEN** một biến thuộc bảy loại bước không nằm trong phạm vi sáu loại bước của sản phẩm
- **THEN** biến đó được phép vắng mặt, không bị coi là thiếu
