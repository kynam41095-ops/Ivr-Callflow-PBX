# Spec Delta

## Purpose

Lưu công việc đang dựng thành một phiên bản nháp mới, hiện trạng thái lưu và giới hạn của việc lưu khi chưa có máy chủ.

## ADDED Requirements

### Requirement: Lưu nháp chỉ từ chối tài liệu sai hình dạng

Hệ thống SHALL từ chối lưu khi tài liệu không đúng hình dạng theo schema kịch bản, và khi từ chối SHALL nêu lỗi và chỉ người dùng sang nút Kiểm tra hợp lệ. Tài liệu sai quan hệ đồ thị và tài liệu có bước Điều kiện theo lịch SHALL vẫn lưu được.

#### Scenario: Tài liệu sai hình dạng

- **WHEN** người dùng bấm Lưu nháp khi một bước còn thiếu trường bắt buộc
- **THEN** hệ thống hiện lỗi nêu tài liệu chưa đúng định dạng và gợi ý bấm Kiểm tra hợp lệ
- **AND** không có phiên bản mới nào được tạo

#### Scenario: Đồ thị còn lỗi vẫn lưu được

- **WHEN** kịch bản có bước mồ côi hoặc nhánh trỏ tới bước không tồn tại
- **THEN** bấm Lưu nháp vẫn tạo phiên bản nháp mới

#### Scenario: Có bước Điều kiện theo lịch vẫn lưu được

- **WHEN** kịch bản có bước Điều kiện theo lịch
- **THEN** bấm Lưu nháp vẫn tạo phiên bản nháp mới

### Requirement: Trạng thái lưu trên đầu trình dựng

Đầu trình dựng SHALL hiện trạng thái chưa lưu khi canvas khác lần tải hoặc lần lưu gần nhất, và đã lưu khi không khác. Trong lúc lưu SHALL hiện `Đang lưu…`; lưu xong SHALL hiện `Đã lưu bản nháp v<số>`; lưu lỗi SHALL hiện thông báo lỗi ở vùng `role="alert"`. Nút Lưu nháp SHALL bị khoá khi đang lưu, đang khôi phục hoặc đang chọn phiên bản khác.

#### Scenario: Sửa canvas thì chuyển chưa lưu

- **WHEN** người dùng kéo một node hoặc sửa một trường trong inspector
- **THEN** trạng thái đổi thành `chưa lưu`

#### Scenario: Lưu thành công

- **WHEN** người dùng bấm Lưu nháp
- **THEN** trạng thái hiện `Đang lưu…` trước
- **AND** sau đó hiện `Đã lưu bản nháp v<số>` với số của phiên bản vừa tạo
- **AND** trạng thái chuyển thành `đã lưu`

#### Scenario: Lưu lỗi

- **WHEN** lần lưu thất bại
- **THEN** vùng trạng thái có `role="alert"` hiện `Không lưu được:` kèm lý do
- **AND** không có lỗi trang nào phát sinh trong trình duyệt

### Requirement: Mỗi lần lưu sinh một phiên bản nháp mới

Mỗi lần lưu thành công SHALL tạo một phiên bản trạng thái nháp với số phiên bản lớn hơn mọi phiên bản hiện có của kịch bản đúng một đơn vị, và SHALL cập nhật thời điểm sửa của kịch bản. Lần lưu SHALL không được đổi phiên bản đang chạy, không đổi đầu số, không sửa phiên bản khác.

#### Scenario: Số phiên bản tăng đúng một

- **WHEN** kịch bản đang có phiên bản lớn nhất là v2 và người dùng lưu nháp
- **THEN** phiên bản mới có số v3 và trạng thái nháp

#### Scenario: Không đụng phiên bản đang chạy

- **WHEN** người dùng lưu nháp cho kịch bản đang có một phiên bản chạy thật
- **THEN** phiên bản đó giữ nguyên mã, trạng thái và nội dung
- **AND** đầu số đang trỏ tới nó không đổi

#### Scenario: Bản chụp tại thời điểm bấm lưu

- **WHEN** người dùng sửa canvas ngay sau khi bấm Lưu nháp, trước khi lưu xong
- **THEN** phiên bản được lưu chứa đúng nội dung tại lúc bấm, không lẫn sửa đổi sau đó

### Requirement: Dữ liệu chỉ tồn tại trong bộ nhớ trình duyệt

Khi chưa có máy chủ, kịch bản, phiên bản, đầu số và danh mục file SHALL chỉ tồn tại trong bộ nhớ của tab đang mở. Tải lại trang SHALL đưa toàn bộ dữ liệu về bộ dữ liệu mẫu ban đầu.

#### Scenario: Tải lại trang

- **WHEN** người dùng lưu nháp rồi tải lại trang
- **THEN** phiên bản vừa lưu không còn
- **AND** danh sách phiên bản trở về dữ liệu mẫu
