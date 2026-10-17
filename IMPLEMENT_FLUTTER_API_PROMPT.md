# Prompt triển khai API cho AI Flutter

Sao chép prompt bên dưới vào AI Chat trong VS Code đang mở Flutter project. Đảm bảo hai tài liệu API được AI truy cập trong workspace hoặc cung cấp chúng vào workspace Flutter.

---

Bạn là Senior Flutter Engineer đang làm việc trực tiếp trong Flutter project hiện tại. Phân tích code hiện có rồi triển khai kết nối Hotel Booking API theo các giai đoạn nhỏ, bảo toàn kiến trúc và chức năng đang hoạt động.

## Tài liệu bắt buộc

1. Đọc toàn bộ `HOTEL_BOOKING_API_DOCUMENT.md`.
2. Đọc toàn bộ `FLUTTER_AI_INTEGRATION_GUIDE.md`.
3. Nếu không tìm thấy tài liệu trong workspace Flutter, tìm workspace được cung cấp. Nếu vẫn không truy cập được, dừng trước khi code và báo tài liệu nào còn thiếu; không tự đoán contract.
4. Tôn trọng nhãn xác minh. Source-verified không có nghĩa production đã chạy thành công.

## Giai đoạn A: Khảo sát trước khi sửa

- Đọc `pubspec.yaml`, cấu trúc `lib/`, tests, navigation/router, state management, DI, UI conventions, API abstractions, error handling và secure storage hiện tại.
- Tìm mock data/fixtures, liệt kê màn hình/use case -> mock -> endpoint -> auth -> trạng thái xác minh.
- Ghi baseline lỗi nếu có.
- Báo cáo mapping và chia công việc thành giai đoạn nhỏ, nêu file dự kiến tái sử dụng/sửa và test phù hợp. Sau đó tiếp tục triển khai trong phạm vi prompt, không dừng để xin phép quyết định kỹ thuật thường lệ.

## Giai đoạn B: API foundation

- Dùng Base URL `https://hotel-booking-backend-fz9h.onrender.com`.
- Tái sử dụng Dio/client hiện có nếu phù hợp; không tạo client/repository trùng chức năng.
- Tạo/cập nhật cấu hình, API client, services, repositories, models, interceptors theo kiến trúc hiện tại.
- Xử lý envelope/error không đồng nhất, null safety, ID opaque string, decimal/numeric, ngày date-only và timestamp.
- Redact token/password/Authorization/PII khỏi mọi logs.
- Chạy test phù hợp sau giai đoạn này.

## Giai đoạn C: Authentication và tài khoản

- Tích hợp register/login/profile/logout theo API document.
- Register gửi `email`, `password` (>= 8 ký tự), `full_name`, `phone`; OpenAPI cũ không khớp source.
- Login nhận JWT từ `token`; lưu secure storage; gửi `Authorization: Bearer <token>` cho endpoints yêu cầu auth.
- Không lưu password. Không tạo refresh flow: backend không hỗ trợ. Logout chỉ xóa token phía client, không revoke JWT server-side.
- Xử lý 401 theo session UX hiện tại, không retry login vô hạn; test validation và parse.

## Giai đoạn D: Hotels và rooms

- Kết nối hotel list/detail, images, amenities, vibes, room types/images, rooms và availability theo endpoints đã ghi.
- `GET /api/hotels` không có hotel search/filter/pagination. Không nối UI search/filter vào query hoặc URL bịa.
- Kiểm tra empty/error states và không kết luận availability nếu request không xác nhận.

## Giai đoạn E: Booking

- Kết nối create/history/detail/cancel, guests, QR data và check-in nếu phù hợp màn hình hiện có.
- Trước mỗi mutation, xác minh method/path/auth/body/validation/response/errors.
- Booking create có room IDs, hotel ID, ngày, adults; children mặc định 0. Response khởi tạo `pending`, không tự hiển thị confirmed.
- Không retry mutation khi timeout nếu không có idempotency contract.
- Check-in theo source chỉ hợp lệ khi booking `confirmed` và check-in là ngày hiện tại.

## Giai đoạn F: Favorites và chức năng khác

- Tích hợp favorites, vouchers, reviews, payment initiation theo contract.
- Payment POST tạo `pending`; không có provider/webhook/confirmation đã xác minh. HTTP 201 không đồng nghĩa đã thanh toán.
- Reviews cần booking đủ điều kiện; xử lý 403/409 đúng response.
- Chỉ thay mock bằng API thật khi endpoint contract đã xác minh. Với phần thiếu endpoint/chưa sử dụng được, giữ mock có đánh dấu và báo cáo.

## Quy tắc thay đổi

- Trước khi code từng chức năng, đối chiếu tài liệu về method, path, headers, query/body, response và errors.
- Ưu tiên sửa/tái sử dụng file hiện có; chỉ thêm file khi architecture cần.
- Giữ nguyên UI, navigation, state management và chức năng khác; không refactor ngoài phạm vi.
- Không bịa endpoint/field/status/business rule/token behavior.
- Không sửa backend/database, không push/commit GitHub, không deploy, không ghi dữ liệu production để test.
- Kiểm tra file và thay đổi hiện tại trước khi sửa; không xóa/ghi đè thay đổi người dùng.
- Nếu runtime response lệch tài liệu, dừng phần phụ thuộc; ghi status/schema đã quan sát sau khi loại PII/token, báo discrepancy và không đoán.

## Kiểm thử và báo cáo

- Chạy test phù hợp sau từng giai đoạn.
- Cuối cùng chạy `flutter pub get` nếu cần, `flutter analyze`, và test hiện hữu phù hợp (ví dụ `flutter test`). Chỉ tuyên bố pass nếu command đã thực sự chạy thành công.
- Sửa lỗi do thay đổi gây ra và phân biệt baseline với lỗi mới.
- Báo cáo: file sửa; flows/endpoints tích hợp; mocks còn lại và lý do; trạng thái xác minh; commands/tests và kết quả; lỗi/contract mismatch chưa xử lý.

Bắt đầu bằng Giai đoạn A: khảo sát Flutter project và lập mapping màn hình/mock/API trước khi sửa code.
