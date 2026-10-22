# Tasks

## 1. Kiểm hình thức bộ spec

- [x] 1.1 Chạy `openspec validate baseline-builder-shell-specs --strict` và sửa mọi cảnh báo (mô tả requirement ≤ 500 ký tự, scenario đúng 4 dấu `#`, mỗi requirement có ít nhất một scenario). Kiểm: lệnh exit 0, không còn dòng `warning`.
- [x] 1.2 Kiểm đủ 8 capability so với proposal: `builder-shell`, `flow-canvas`, `node-inspector`, `draft-authoring`, `flow-validation`, `version-history`, `number-management`, `visual-theme`. Kiểm: `ls openspec/changes/baseline-builder-shell-specs/specs | wc -l` = 8.

## 2. Đối chiếu scenario với test đang xanh

- [x] 2.1 Lập bảng ánh xạ từng `#### Scenario:` sang file test và tên test đang xanh, ghi vào cuối `tasks.md` hoặc `design.md` của change (chỉ ghi chú, không thêm file mới). Kiểm: mỗi scenario có ít nhất một dòng ánh xạ hoặc nhãn `chưa có test`.
- [x] 2.2 Với scenario chưa có test, ghi rõ lý do (hành vi chưa kiểm được tự động) và **không** sửa spec để khớp test. Kiểm: không scenario nào bị xoá hoặc viết lại trong bước này (`git diff` chỉ thêm ghi chú).
- [x] 2.3 Xác nhận lại bằng chứng nền: `docker compose --profile test run --rm frontend-test npm test` xanh (64 unit + 81 e2e) tại commit đang dùng để viết spec. Kiểm: log không có `failed`.

## 3. Chặn phạm vi sai

- [x] 3.1 Kiểm không requirement nào mô tả hành vi chưa tồn tại: `grep -rniE "ban hành|xác thực|tenant|tải lên|máy chủ" openspec/changes/baseline-builder-shell-specs/specs`. Kiểm: mọi kết quả chỉ nói về việc **chưa** có (ví dụ trong `draft-authoring` về giới hạn bộ nhớ) hoặc nằm trong tên trạng thái `Đang chạy`.
- [x] 3.2 Kiểm không requirement nào phụ thuộc tên class, hàm hay thư viện nội bộ: `grep -rnE "\b(React|Vite|Vitest|Playwright|useState|saveDraft|collectIssues)\b" openspec/changes/baseline-builder-shell-specs/specs`. Kiểm: rỗng.

## 4. Chuyển sang monorepo và đóng sổ

- [x] 4.1 Sau khi `monorepo-hoa` hoàn tất, nếu monorepo được dựng tại chỗ (gốc hiện tại) thì change này đã nằm sẵn trong repo `app-business`; nếu dựng ở thư mục khác thì chuyển `openspec/changes/baseline-builder-shell-specs/` sang đó. Chạy `openspec validate baseline-builder-shell-specs --strict` trong monorepo. Kiểm: exit 0.
- [x] 4.2 Kiểm đường dẫn được spec nhắc tới tồn tại trong monorepo: `contracts/flow-document.schema.json`. Kiểm: `test -f contracts/flow-document.schema.json`.

## Workflow follow-up

- Archive bằng `/openspec-archive-change`: archive sẽ ghi 30 requirement vào `openspec/specs/<capability>/spec.md` và sao `## Purpose` sang spec chính.

## Ánh xạ scenario → test (task 2.1)

Bằng chứng lấy từ cây đang chạy: 64 unit (vitest) + 81 e2e (Playwright `--list`, 2026-10-22). Đường dẫn tính từ gốc repo. Cột **Trạng thái**: `xanh` = có test đang bao scenario; `một phần` = test chỉ phủ một vế của scenario; `chưa có test` = hành vi có trong code nhưng không có test tự động (giữ nguyên spec, không sửa để khớp test — task 2.2).

### builder-shell (8 scenario)

| Scenario | Test chứng minh | Trạng thái |
|---|---|---|
| Mở trình dựng theo mã kịch bản | `services/frontend/e2e/builder-canvas.spec.ts:259` mở trình dựng kịch bản đủ sáu loại; `services/frontend/e2e/numbers.spec.ts:100` liên kết đổi hash mở trình dựng | xanh |
| Hash rỗng hoặc không nhận dạng được | `services/frontend/e2e/numbers.spec.ts:95` goto('/') vẫn hiện màn đầu số; `services/frontend/e2e/error-states.spec.ts:139` hash lạ rơi về màn đầu số; `services/frontend/e2e/builder-canvas.spec.ts:292` hash `#/flows/%` không sập | xanh |
| Đổi từ màn đầu số sang trình dựng | `services/frontend/e2e/numbers.spec.ts:100` liên kết: bấm link kịch bản mở trình dựng | xanh |
| Nạp thành công | `services/frontend/e2e/builder-canvas.spec.ts:259` (0 pageerror/console error, đủ sáu loại); `services/frontend/e2e/canvas-native.spec.ts:33` canvas ba node | xanh |
| Kịch bản chưa có phiên bản | không có test; hành vi nằm ở `services/frontend/src/screens/builder/BuilderScreen.tsx:206` (ném lỗi "chưa có phiên bản nào"), dữ liệu mẫu không có kịch bản rỗng phiên bản nên không dựng được cảnh này | chưa có test |
| Nạp lỗi rồi thử lại | `services/frontend/e2e/error-states.spec.ts:19` TC-FLOW-023 cả ba màn hiện lỗi kèm retry, thử lại hồi phục thật | xanh |
| Chip trạng thái theo phiên bản đang mở | `services/frontend/e2e/chrome-visual.spec.ts:149` đầu trình dựng + thanh trạng thái theo phiên bản đang mở; `services/frontend/e2e/chrome-visual.spec.ts:402` đổi theo version-select | xanh |
| Mở danh sách phiên bản khi đang lỗi nạp | `services/frontend/e2e/error-states.spec.ts:19` (bấm `versions-open` ngay trong trạng thái lỗi nạp, dòng 60) | xanh |

### draft-authoring (10 scenario)

| Scenario | Test chứng minh | Trạng thái |
|---|---|---|
| Tài liệu sai hình dạng | `services/frontend/src/data/drafts.test.ts:144` lớp 1 đỏ → reject, kho không đổi; `services/frontend/e2e/builder-save.spec.ts:65` lưu bị từ chối hiện trạng thái lỗi | xanh |
| Đồ thị còn lỗi vẫn lưu được | `services/frontend/src/data/drafts.test.ts:117` lớp 2 đỏ vẫn resolve | xanh |
| Có bước Điều kiện theo lịch vẫn lưu được | `services/frontend/src/flow/validate.test.ts:189` + `services/frontend/src/canvas/issues.test.ts:42` chứng minh tài liệu schedule qua cả hai lớp (nên không bị chặn lưu); không có test gọi lưu trực tiếp với kịch bản schedule | một phần |
| Sửa canvas thì chuyển chưa lưu | `services/frontend/e2e/chrome-visual.spec.ts:277` (dòng 323: `dirty-status` = "chưa lưu", dòng 336 "đã lưu"); `services/frontend/e2e/keymap-target.spec.ts:106` (dòng 120) | xanh |
| Lưu thành công | `services/frontend/e2e/builder-save.spec.ts:28` TC-FLOW-020 Đang lưu… rồi Đã lưu; `services/frontend/src/data/drafts.test.ts:24` | xanh |
| Lưu lỗi | không có test cho vùng `role="alert"` "Không lưu được:" (`services/frontend/src/screens/builder/BuilderScreen.tsx:898`); tầng dữ liệu có `services/frontend/src/data/mock-fail.test.ts:41` | chưa có test |
| Số phiên bản tăng đúng một | `services/frontend/src/data/drafts.test.ts:24`; `services/frontend/e2e/builder-save.spec.ts:51` bấm đúp chỉ tạo một phiên bản, bấm tiếp tạo phiên bản kế | xanh |
| Không đụng phiên bản đang chạy | `services/frontend/src/data/drafts.test.ts:76` | xanh |
| Bản chụp tại thời điểm bấm lưu | `services/frontend/src/data/drafts.test.ts:49` | xanh |
| Tải lại trang | `services/frontend/e2e/reload.spec.ts:14` TC-FLOW-025 | xanh |

### flow-canvas (9 scenario)

| Scenario | Test chứng minh | Trạng thái |
|---|---|---|
| Palette mặc định thu gọn | `services/frontend/e2e/builder-palette.spec.ts:50` TC-FLOW-035 thu gọn 56px, sáu mã, tooltip; `services/frontend/e2e/builder-canvas.spec.ts:38` TC-CALL-015 | xanh |
| Mở rộng palette | `services/frontend/e2e/builder-canvas.spec.ts:38` nhánh "mở rộng: đúng sáu tên" | xanh |
| Kéo một bước vào canvas | `services/frontend/e2e/builder-palette.spec.ts:133` thả một mục thêm đúng 1 node; `services/frontend/e2e/builder-canvas.spec.ts:122` TC-CALL-017 | xanh |
| Tóm tắt bước Phát lời thoại | `services/frontend/e2e/canvas-visual.spec.ts:183` đối chiếu `node-summary` với bản đồ chữ đã chốt (dòng 246-252), gồm `—` cho start/hangup; riêng vế "file không có trong danh mục → `—`" cho node play chưa có ca riêng | một phần |
| Tóm tắt bước Menu | `services/frontend/e2e/canvas-visual.spec.ts:183` (bản đồ dòng 76: `Lời nhắc menu chính · chờ 5s`) | xanh |
| Nhánh dự phòng của bước Bắt đầu | `services/frontend/e2e/canvas-visual.spec.ts:405` TC-FLOW-030 cạnh nhánh dự phòng nét đứt màu lỗi | xanh |
| Bước không có cổng ra | `services/frontend/e2e/builder-canvas.spec.ts:112` TC-CALL-016 cho node Chuyển hàng đợi; vế Kết thúc chưa có test riêng | một phần |
| Canvas có đủ ba thành phần | `services/frontend/e2e/canvas-visual.spec.ts:480` TC-FLOW-031 nền chấm/controls/minimap; `services/frontend/e2e/canvas-native.spec.ts:99` TC-FLOW-013 | xanh |
| Xoá node đang chọn | `services/frontend/e2e/builder-validate.spec.ts:128` xoá node start bằng Backspace | xanh |

### flow-validation (9 scenario)

| Scenario | Test chứng minh | Trạng thái |
|---|---|---|
| Bước thiếu trường bắt buộc | `services/frontend/src/flow/validate.test.ts:137` TC-FLOW-016 (+ `:154` TC-FLOW-017, `:171` TC-FLOW-018); `services/frontend/e2e/builder-validate.spec.ts:104` dấu `INVALID_SHAPE` nêu `mediaId` | xanh |
| Một dấu cho mỗi bước sai | `services/frontend/src/canvas/issues.test.ts:63` nhiều lỗi ajv nhưng đúng 1 `INVALID_SHAPE` | xanh |
| Nhánh trỏ tới bước không tồn tại | `services/frontend/src/flow/validate.test.ts:123` TC-FLOW-026; `services/frontend/src/canvas/issues.test.ts:80` | xanh |
| Bước mồ côi | `services/frontend/src/flow/validate.test.ts:109` TC-FLOW-015; `services/frontend/e2e/builder-validate.spec.ts:29` TC-FLOW-021 | xanh |
| Điểm vào hỏng | `services/frontend/src/canvas/issues.test.ts:135` startNodeId rỗng → `INVALID_START`, không `ORPHAN_NODE`; `services/frontend/e2e/builder-validate.spec.ts:128` | xanh |
| Có bước Điều kiện theo lịch | `services/frontend/src/flow/validate.test.ts:189` TC-FLOW-027; `services/frontend/src/canvas/issues.test.ts:42`; `services/frontend/e2e/builder-validate.spec.ts:87` cảnh báo không phải lỗi | xanh |
| Lỗi hiện ngay trong node sai | `services/frontend/e2e/builder-validate.spec.ts:29` TC-FLOW-021 dấu nằm trong thẻ node | xanh |
| Dấu giữ tới lần kiểm sau | không có test kiểm việc dấu còn sau khi sửa canvas; test hiện có chỉ kiểm không nhân đôi khi bấm lại (`builder-validate.spec.ts:61`) | chưa có test |
| Bấm kiểm hai lần | `services/frontend/e2e/builder-validate.spec.ts:61` TC-FLOW-024 bấm lại không nhân đôi | xanh |

### node-inspector (11 scenario)

| Scenario | Test chứng minh | Trạng thái |
|---|---|---|
| Chọn bước Phát lời thoại | `services/frontend/e2e/builder-inspector.spec.ts:142` TC-CALL-021 (`playNode`, mọi điều khiển ánh xạ `$defs`); `services/frontend/e2e/inspector-visual.spec.ts:99` TC-FLOW-036 | xanh |
| Chọn bước Chuyển hàng đợi | `services/frontend/e2e/builder-inspector.spec.ts:142` (ca `queueNode`) | xanh |
| Đóng inspector | `services/frontend/e2e/inspector-visual.spec.ts:99` đóng bằng `›` | xanh |
| Đổi thời gian chờ | `services/frontend/e2e/inspector-visual.spec.ts:99` (dòng 257: `node-summary` đổi thành "chờ 6s") | xanh |
| Thêm phím | `services/frontend/e2e/inspector-visual.spec.ts:308` TC-CALL-025 | xanh |
| Đủ mười hai phím | `services/frontend/e2e/inspector-visual.spec.ts:308` (giới hạn 12) | xanh |
| Đổi phím giữ đích | `services/frontend/e2e/inspector-visual.spec.ts:308` (đổi phím) + `services/frontend/e2e/keymap-target.spec.ts:106` | xanh |
| Phím đã nối hiện tên đích | `services/frontend/e2e/keymap-target.spec.ts:106` TC-CALL-026 đích chỉ đọc | xanh |
| Thêm khung giờ thứ hai | `services/frontend/e2e/builder-inspector.spec.ts:73` TC-CALL-020 | xanh |
| Không xoá được khung duy nhất | `services/frontend/e2e/builder-inspector.spec.ts:73` (nút xoá chỉ hiện khi >1 khung) | xanh |
| Chọn rỗng trên một trục | `services/frontend/e2e/builder-inspector.spec.ts:73` (chọn rỗng = không giới hạn) | xanh |

### number-management (12 scenario)

| Scenario | Test chứng minh | Trạng thái |
|---|---|---|
| Đầu số chưa gán kịch bản | `services/frontend/e2e/numbers.spec.ts:41` TC-PBX-008 ("Chưa có kịch bản"); `services/frontend/e2e/numbers-visual.spec.ts:157` | xanh |
| Đầu số có kịch bản đang chạy | `services/frontend/e2e/numbers.spec.ts:41`; `services/frontend/e2e/numbers-visual.spec.ts:157` (trạng thái + chấm màu) | xanh |
| Bấm tên kịch bản | `services/frontend/e2e/numbers.spec.ts:100` | xanh |
| Tìm theo tên kịch bản | `services/frontend/e2e/numbers-visual.spec.ts:220` lọc theo số/tên, thẻ thống kê không đổi | xanh |
| Đang tải | không có test nào dừng ở trạng thái tải của ba thẻ thống kê; `numbers-visual.spec.ts:212` kiểm `—` ở cột số node, không phải thẻ | chưa có test |
| Tạo thành công | `services/frontend/e2e/numbers.spec.ts:69` TC-PBX-010; `services/frontend/src/data/numbers.test.ts:15` | xanh |
| Số quá dài | `services/frontend/e2e/numbers.spec.ts:149` ca "33 ký tự (vượt biên)"; `services/frontend/src/data/numbers.test.ts:52` biên 32 ký tự resolve | xanh |
| Số đã tồn tại | `services/frontend/e2e/numbers.spec.ts:149` ca "trùng đầu số đã có" | xanh |
| Bấm Tạo hai lần | `services/frontend/e2e/numbers.spec.ts:190` | xanh |
| Huỷ hộp thoại | `services/frontend/e2e/numbers.spec.ts:111` (Escape); `services/frontend/e2e/numbers.spec.ts:127` (number-cancel) | xanh |
| Tạo kịch bản thành công | `services/frontend/e2e/builder-validate.spec.ts:61` TC-FLOW-024 (kịch bản mới có đúng node Bắt đầu); `services/frontend/e2e/chrome-visual.spec.ts:380`; `services/frontend/src/data/drafts.test.ts:196` | xanh |
| Tạo kịch bản lỗi | `services/frontend/e2e/error-states.spec.ts:87` (createFlow lỗi); `services/frontend/e2e/error-states.spec.ts:110` (saveDraft lỗi) | xanh |

### version-history (7 scenario)

| Scenario | Test chứng minh | Trạng thái |
|---|---|---|
| Mở drawer | `services/frontend/e2e/chrome-visual.spec.ts:402` TC-FLOW-033; `services/frontend/e2e/versions.spec.ts:257` bấm đúp chỉ mở một drawer | xanh |
| Nhãn trạng thái đúng | `services/frontend/e2e/chrome-visual.spec.ts:402` (nhãn + chấm màu + đúng một mục Đang mở) | xanh |
| Đọc danh sách lỗi | `services/frontend/e2e/versions.spec.ts:327` hiện retry, ẩn `version-restore` | xanh |
| Thử lại thành công | `services/frontend/e2e/versions.spec.ts:327` gỡ query rồi retry phục hồi đúng; `services/frontend/e2e/error-states.spec.ts:19` | xanh |
| Khôi phục phiên bản lưu trữ | `services/frontend/e2e/versions.spec.ts:44` TC-FLOW-022; `services/frontend/src/data/drafts.test.ts:105` | xanh |
| Không chạy chồng với lưu nháp | `services/frontend/e2e/versions.spec.ts:133`; `services/frontend/e2e/versions.spec.ts:174` | xanh |
| Khôi phục lỗi | `services/frontend/e2e/versions.spec.ts:263`; `services/frontend/e2e/versions.spec.ts:298` | xanh |

### visual-theme (3 scenario)

| Scenario | Test chứng minh | Trạng thái |
|---|---|---|
| Số lượng biến | `services/frontend/e2e/tokens.spec.ts:64` TC-FLOW-028 fixture đúng sha256 và đủ 122 biến | xanh |
| Đối chiếu từng biến ở ba màn hình | `services/frontend/e2e/tokens.spec.ts:98` ba ca: `#/flows/…`, `#/numbers`, versions-drawer | xanh |
| Biến của loại bước ngoài phạm vi | `services/frontend/e2e/tokens.spec.ts:64` so đúng tập 122 biến nên biến của bảy loại bước ngoài sáu loại không bị đòi | xanh |

### Tổng hợp (task 2.2)

- 69 scenario: **62 xanh**, **3 một phần**, **4 chưa có test** (`builder-shell/` kịch bản chưa có phiên bản, `draft-authoring/` lưu lỗi, `flow-validation/` dấu giữ tới lần kiểm sau, `number-management/` đang tải).
- Lý do chưa có test: cả bốn đều là trạng thái giao diện phụ thuộc dữ liệu mẫu chưa dựng được (kịch bản rỗng phiên bản, lần lưu lỗi ở UI, dấu kiểm tồn tại qua lần sửa canvas, trạng thái tải của ba thẻ thống kê).
- Không scenario nào bị xoá hay viết lại trong bước này: `git diff` trên `specs/**` rỗng tại thời điểm 2.2. Phần sửa wording sau đó ở task 3.1 ghi ở mục dưới.

### Ghi chú sửa wording ở task 3.1

Lệnh kiểm 3.1 bắt 5 chỗ mô tả khái niệm không tồn tại: 3 chỗ "… của tenant" (code không có tenant — `grep -rni tenant` trong `services/frontend/src` chỉ trả về comment API tương lai) và 2 chỗ "phiên bản đã ban hành" (không có thao tác ban hành; `published` là trạng thái, nhãn UI `Đang chạy`).

Đã sửa 6 câu wording, không đổi hành vi, không đổi số requirement/scenario:

| File | Trước | Sau |
|---|---|---|
| `builder-shell/spec.md` | kịch bản của tenant | kịch bản đang có trong dữ liệu |
| `node-inspector/spec.md` | từ danh mục file của tenant | từ danh mục file âm thanh đang có |
| `number-management/spec.md` | xem toàn bộ đầu số của tenant | xem toàn bộ đầu số đang có |
| `number-management/spec.md` | đầu số trỏ tới một phiên bản đã ban hành | đầu số trỏ tới một phiên bản đang chạy |
| `version-history/spec.md` | drawer hiện một phiên bản đã ban hành và một phiên bản nháp | drawer hiện một phiên bản đang chạy và một phiên bản nháp |
| `version-history/spec.md` | phiên bản đã ban hành mang nhãn `Đang chạy` | phiên bản đang chạy mang nhãn `Đang chạy` |

Sau khi sửa: `grep -rniE "ban hành|xác thực|tenant|tải lên|máy chủ" specs` chỉ còn 2 dòng, cả hai nói rõ "khi **chưa** có máy chủ" trong `draft-authoring`. `openspec validate --strict` exit 0; số requirement = 30, scenario = 69.
