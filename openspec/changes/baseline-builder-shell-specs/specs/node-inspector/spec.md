# Spec Delta

## Purpose

Bảng thuộc tính của bước đang chọn: chỉnh nội dung từng loại bước, bản đồ phím của Menu và khung giờ của Điều kiện theo lịch.

## ADDED Requirements

### Requirement: Inspector theo loại bước

Khi người dùng chọn một node, inspector SHALL hiện tiêu đề, mã node, loại bước và trường nhãn tự do, cộng các trường riêng của loại bước đó. Inspector SHALL đóng được bằng nút đóng.

#### Scenario: Chọn bước Phát lời thoại

- **WHEN** người dùng bấm vào node Phát lời thoại
- **THEN** inspector hiện trường chọn file âm thanh từ danh mục file của tenant

#### Scenario: Chọn bước Chuyển hàng đợi

- **WHEN** người dùng bấm vào node Chuyển hàng đợi
- **THEN** inspector hiện danh sách chọn hàng đợi

#### Scenario: Đóng inspector

- **WHEN** người dùng bấm nút đóng
- **THEN** inspector ẩn đi và canvas giữ nguyên các bước

### Requirement: Tham số Menu phím bấm

Inspector của bước Menu SHALL cho chọn file âm thanh lời nhắc, số lần thử lại tối đa và thời gian chờ bằng thanh trượt có hiện giá trị hiện tại.

#### Scenario: Đổi thời gian chờ

- **WHEN** người dùng kéo thanh trượt thời gian chờ
- **THEN** giá trị mới hiện cạnh thanh trượt
- **AND** tóm tắt trên thẻ node đổi theo giá trị đó

### Requirement: Bản đồ phím của bước Menu

Bản đồ phím SHALL chỉ dùng mười hai phím `1`–`9`, `0`, `*`, `#`, mỗi phím một đích. Thêm phím SHALL chọn phím còn trống đầu tiên và để đích rỗng cho tới khi nối cạnh; khi đủ mười hai phím thì không thêm được. Đổi phím SHALL giữ nguyên đích và cạnh; xoá phím SHALL xoá luôn cạnh bám vào phím đó. Danh sách SHALL hiện tên node đích dạng chỉ đọc, và ghi `Chưa nối` khi phím chưa có đích.

#### Scenario: Thêm phím

- **WHEN** người dùng bấm thêm phím trong bản đồ phím
- **THEN** bản đồ có thêm phím trống đầu tiên với đích rỗng
- **AND** dòng đích ghi `Chưa nối`

#### Scenario: Đủ mười hai phím

- **WHEN** bản đồ phím đã có đủ mười hai phím
- **THEN** nút thêm phím không thêm được phím nào nữa

#### Scenario: Đổi phím giữ đích

- **WHEN** người dùng đổi một phím đã nối sang phím khác còn trống
- **THEN** phím mới giữ đúng đích của phím cũ
- **AND** dòng đích hiện tên node đích đó

#### Scenario: Phím đã nối hiện tên đích

- **WHEN** phím trong bản đồ phím đã có cạnh nối tới một node có tên
- **THEN** dòng đích hiện tên node đích, chỉ đọc, không sửa được từ đây

### Requirement: Khung giờ của bước Điều kiện theo lịch

Inspector của bước Điều kiện theo lịch SHALL cho nhập múi giờ và quản lý danh sách khung giờ áp dụng. Mỗi khung SHALL có khoảng giờ bắt đầu–kết thúc và bốn trục chọn khoảng: Thứ, Ngày, Tháng, Năm. Hệ thống SHALL cho thêm tối đa 64 khung, và chỉ cho xoá khung khi còn nhiều hơn một khung.

#### Scenario: Thêm khung giờ thứ hai

- **WHEN** người dùng bấm `+ Khung giờ`
- **THEN** danh sách có khung thứ hai, mỗi khung có đủ khoảng giờ và bốn trục
- **AND** khung thứ nhất hiện nút xoá

#### Scenario: Không xoá được khung duy nhất

- **WHEN** danh sách chỉ còn một khung giờ
- **THEN** khung đó không có nút xoá

#### Scenario: Chọn rỗng trên một trục

- **WHEN** người dùng bỏ chọn giới hạn của một trục
- **THEN** trục đó được coi là không giới hạn, không phải giá trị rỗng sai
