# flow-validation Specification

## Purpose

Kiểm tính hợp lệ của kịch bản đang dựng theo hai lớp — hình dạng tài liệu và quan hệ đồ thị — rồi chỉ ra lỗi nằm ở bước nào.

## Requirements

### Requirement: Kiểm hình dạng theo schema kịch bản

Hệ thống SHALL kiểm tài liệu kịch bản theo lược đồ `flow-document.schema.json` phiên bản 1.1.0 ở mọi lần kiểm, kể cả khi tài liệu đã sai từ lớp khác. Mỗi bước sai SHALL sinh đúng một dấu lỗi mang mã `INVALID_SHAPE`, và thông báo SHALL nêu các trường bắt buộc còn thiếu của đúng loại bước đó.

#### Scenario: Bước thiếu trường bắt buộc

- **WHEN** một bước Phát lời thoại thiếu file âm thanh
- **THEN** kết quả kiểm có lỗi `INVALID_SHAPE` gắn vào đúng bước đó
- **AND** thông báo nêu tên trường còn thiếu

#### Scenario: Một dấu cho mỗi bước sai

- **WHEN** một bước sai nhiều trường cùng lúc
- **THEN** bước đó chỉ nhận một dấu lỗi, không nhận một dấu cho mỗi trường

### Requirement: Kiểm quan hệ đồ thị

Hệ thống SHALL báo lỗi `INVALID_START` khi điểm vào không trỏ tới một bước Bắt đầu có thật, `DANGLING_BRANCH` khi một nhánh trỏ tới bước không tồn tại, và `ORPHAN_NODE` khi có bước không đi tới được từ điểm vào. Khi điểm vào hỏng, hệ thống SHALL không báo thêm lỗi mồ côi.

#### Scenario: Nhánh trỏ tới bước không tồn tại

- **WHEN** một phím của Menu trỏ tới mã bước đã bị xoá
- **THEN** kết quả kiểm có `DANGLING_BRANCH` gắn vào bước Menu đó

#### Scenario: Bước mồ côi

- **WHEN** một bước không có đường đi tới từ bước Bắt đầu
- **THEN** kết quả kiểm có `ORPHAN_NODE` gắn vào bước đó

#### Scenario: Điểm vào hỏng

- **WHEN** điểm vào của kịch bản không trỏ tới bước Bắt đầu
- **THEN** kết quả kiểm có `INVALID_START`
- **AND** không có lỗi `ORPHAN_NODE` nào được thêm

### Requirement: Cảnh báo bước Điều kiện theo lịch

Mỗi bước Điều kiện theo lịch SHALL sinh cảnh báo `SCHEDULE_NOT_PUBLISHABLE` ở mức cảnh báo. Cảnh báo SHALL không làm kịch bản thành không hợp lệ.

#### Scenario: Có bước Điều kiện theo lịch

- **WHEN** kịch bản chỉ có cảnh báo về bước Điều kiện theo lịch
- **THEN** kết quả kiểm ghi kịch bản hợp lệ kèm số cảnh báo

### Requirement: Hiện kết quả kiểm trên canvas

Bấm Kiểm tra hợp lệ SHALL hiện tóm tắt dạng `Kịch bản hợp lệ` hoặc `Kịch bản có <n> lỗi`, kèm số cảnh báo nếu có, và gắn dấu lỗi lên đúng node sai thay vì chỉ một thông báo chung ở đầu trang. Dấu SHALL giữ tới lần kiểm kế tiếp và SHALL không tự xoá khi người dùng sửa canvas.

#### Scenario: Lỗi hiện ngay trong node sai

- **WHEN** kịch bản có một bước mồ côi và người dùng bấm Kiểm tra hợp lệ
- **THEN** dấu lỗi hiện trong chính thẻ node đó
- **AND** tóm tắt ghi `Kịch bản có 1 lỗi`

#### Scenario: Dấu giữ tới lần kiểm sau

- **WHEN** người dùng sửa canvas sau khi đã kiểm và lỗi đã được sửa
- **THEN** dấu lỗi vẫn hiện cho tới lần bấm Kiểm tra hợp lệ tiếp theo

#### Scenario: Bấm kiểm hai lần

- **WHEN** người dùng bấm Kiểm tra hợp lệ hai lần liên tiếp
- **THEN** số lỗi và số dấu không nhân đôi
