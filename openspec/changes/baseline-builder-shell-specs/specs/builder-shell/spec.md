# Spec Delta

## Purpose

Điều hướng giữa màn quản lý đầu số và trình dựng kịch bản, nạp dữ liệu cần cho trình dựng và xử lý trạng thái lỗi khi nạp.

## ADDED Requirements

### Requirement: Điều hướng theo hash

Ứng dụng SHALL chọn màn hình theo `window.location.hash`: hash khớp `#/flows/<flowId>` mở trình dựng cho kịch bản đó; mọi hash khác, kể cả rỗng hoặc không nhận dạng được, mở màn quản lý đầu số. Đổi hash SHALL đổi màn hình mà không tải lại trang.

#### Scenario: Mở trình dựng theo mã kịch bản

- **WHEN** người dùng mở `#/flows/FLOW_MAIN`
- **THEN** trình dựng của kịch bản `FLOW_MAIN` hiện trên canvas
- **AND** không có yêu cầu tải lại trang

#### Scenario: Hash rỗng hoặc không nhận dạng được

- **WHEN** người dùng mở đường dẫn không có hash, hoặc hash lạ như `#/khong-ton-tai`
- **THEN** màn quản lý đầu số hiện ra

#### Scenario: Đổi từ màn đầu số sang trình dựng

- **WHEN** người dùng bấm liên kết tên kịch bản trên màn quản lý đầu số
- **THEN** hash đổi thành `#/flows/<flowId>` và trình dựng của kịch bản đó hiện ra

### Requirement: Nạp dữ liệu trình dựng

Trình dựng SHALL tải đồng thời danh sách phiên bản, file âm thanh, hàng đợi, đầu số và kịch bản đang có trong dữ liệu, rồi mở lên canvas phiên bản được chỉ định, hoặc phiên bản có số lớn nhất nếu không chỉ định. Kịch bản không có phiên bản nào SHALL được coi là lỗi nạp.

#### Scenario: Nạp thành công

- **WHEN** mọi nguồn dữ liệu trả về thành công
- **THEN** canvas hiện các bước của phiên bản mới nhất
- **AND** bộ chọn phiên bản và chip trạng thái hiện đúng phiên bản đang mở

#### Scenario: Kịch bản chưa có phiên bản

- **WHEN** kịch bản được mở không có phiên bản nào
- **THEN** trình dựng hiện thông báo lỗi nêu kịch bản chưa có phiên bản
- **AND** không hiện canvas rỗng như thể kịch bản trống

### Requirement: Lỗi nạp có đường thử lại

Khi nạp dữ liệu trình dựng thất bại, hệ thống SHALL hiện thông báo lỗi có thể đọc bằng trình đọc màn hình và một nút thử lại; thử lại thành công SHALL thay thông báo lỗi bằng trình dựng đã nạp.

#### Scenario: Nạp lỗi rồi thử lại

- **WHEN** một trong các nguồn dữ liệu trả lỗi
- **THEN** vùng lỗi có `role="alert"` hiện thông báo và nút thử lại
- **AND** sau khi nguồn dữ liệu hoạt động trở lại, bấm thử lại hiện trình dựng bình thường
- **AND** không có lỗi trang nào phát sinh trong trình duyệt

### Requirement: Header hiện phiên bản đang mở

Header trình dựng SHALL hiện bộ chọn phiên bản dạng `v<số> · <nhãn trạng thái>` và một chip trạng thái của phiên bản đang mở, với nhãn tương ứng `draft` là bản nháp, `published` là đang chạy, `archived` là lưu trữ. Nút mở danh sách phiên bản SHALL bấm được ở mọi trạng thái, kể cả khi nạp lỗi.

#### Scenario: Chip trạng thái theo phiên bản đang mở

- **WHEN** người dùng chọn một phiên bản ở bộ chọn phiên bản
- **THEN** chip trạng thái đổi sang nhãn của phiên bản đó
- **AND** canvas nạp tài liệu của phiên bản đó

#### Scenario: Mở danh sách phiên bản khi đang lỗi nạp

- **WHEN** trình dựng đang ở trạng thái lỗi nạp
- **THEN** nút `Phiên bản · <số>` vẫn bấm được và mở drawer phiên bản
