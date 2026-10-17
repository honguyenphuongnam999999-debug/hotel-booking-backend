# Hướng dẫn AI tích hợp Hotel Booking API vào Flutter

API contract: [HOTEL_BOOKING_API_DOCUMENT.md](HOTEL_BOOKING_API_DOCUMENT.md). Source verification không đồng nghĩa API production đã được kiểm tra. Hãy giữ nguyên nhãn trạng thái trong tài liệu API.

## 1. Khảo sát project trước khi sửa

1. Đọc `pubspec.yaml`, Dart/Flutter SDK, dependencies và code generation.
2. Khảo sát `lib/`, tests, integration tests, router/navigation, state management, dependency injection, UI conventions và error handling.
3. Tìm API clients, Dio/http wrappers, interceptors, services, repositories, models/DTOs, secure storage.
4. Tìm mock data/fixtures và màn hình đang dùng; lập mapping màn hình/use case -> mock -> endpoint -> auth -> trạng thái xác minh.
5. Tái sử dụng cấu trúc/package/UI/navigation/state management hiện tại; không tạo kiến trúc/client trùng.
6. Ghi nhận baseline lỗi trước khi sửa để phân biệt lỗi mới.

## 2. Contract và Base URL

- Production Base URL: `https://hotel-booking-backend-fz9h.onrender.com`.
- Đọc catalog, từng schema và OpenAPI discrepancy trong API document trước khi tích hợp.
- Chỉ dùng method/path/query/body/response có bằng chứng. Source tồn tại nhưng production chưa test; kiểm tra runtime có kiểm soát nếu được phép.
- Register thực tế yêu cầu email/password/full_name/phone; password >= 8 ký tự. OpenAPI cũ khác implementation.
- `GET /api/hotels` không hỗ trợ search/filter/pagination; không gửi query giả.
- Payment creation chỉ trả `pending`; không tuyên bố payment hoàn tất.
- Nếu payload thực tế khác source/document, dừng phần phụ thuộc, ghi lại khác biệt sau khi xóa token/PII và không đoán contract.

## 3. Tầng API

- Tái sử dụng Dio nếu dự án đã dùng; nếu đang có HTTP client tốt, đánh giá trước khi thay.
- Tạo/cập nhật client, services, repositories và Dart models theo pattern hiện có; đặt cấu hình Base URL theo môi trường project.
- Không hardcode secrets; Base URL không phải secret.
- Gửi JSON Content-Type khi có JSON body; không thêm header/body ngoài contract.
- Giữ transport/parsing tách khỏi UI theo kiến trúc hiện tại; widget không tự ghép URL tùy tiện.
- Response thường có `success` và `data`, nhưng register trả `user`; lỗi không có schema/message đồng nhất.

## 4. Models và parsing

- ID là `String` opaque; đừng giả định tất cả UUID.
- Handle nullable fields đúng contract, không biến null thành chuỗi giả.
- Parse `num` an toàn cho tiền/decimal; xem xét response numeric dạng string nếu runtime xác nhận.
- Ngày booking là `YYYY-MM-DD`, không timezone-convert làm lệch ngày.
- Parse ISO-8601 timestamp bằng `DateTime.parse`; không cộng tay giờ Việt Nam vào UTC đã parse.
- Status có thể mở rộng; enum nên chịu được giá trị chưa biết.
- Theo serialization/toolchain đã có (`json_serializable` hoặc khác); chỉ chạy generator nếu project dùng.

## 5. Authentication

- Login trả JWT trong `token`, source quy định 7 ngày.
- Thêm `Authorization: Bearer <token>` cho route yêu cầu auth. Hotel reviews GET cho phép anonymous, nhưng token nếu gửi phải hợp lệ.
- Dùng secure storage package đã có hoặc phù hợp; không lưu password và không log token/password/header/PII.
- Logout server không revoke token; client xóa token. Không triển khai refresh token, vì backend không hỗ trợ.
- Khi 401, xử lý session theo UX hiện có; không tự login/retry vô hạn. Redact Dio/crash logs.

## 6. UI, loading và errors

- Giữ UI, navigation, accessibility và state management hiện hữu.
- Mỗi view xử lý loading, loaded, empty, retryable network error, timeout, validation và HTTP errors.
- Phân biệt network/parse, 400, 401, 403, 404, 409, 500. Parse `success/message` null-safe; register conflict có thể kèm `errors` map.
- Không retry mutation booking/payment/review/favorite nếu không có idempotency contract.
- Dùng cache/invalidation hiện có để tránh gọi list/detail lặp; không làm hỏng feature hoạt động.
- Không hiện booking/payment thành công nếu backend chưa xác nhận.

## 7. Thứ tự tích hợp

1. API client, Base URL, response/error mapping.
2. Register/login/profile/logout và secure JWT storage.
3. Hotel list/detail, images, amenities, vibes. Search/filter chỉ kết nối nếu có endpoint xác minh; hiện **NOT IMPLEMENTED**.
4. Room types, rooms, availability.
5. Booking create/history/detail/cancel, guests, QR data, check-in.
6. Favorites.
7. Vouchers, reviews, payment initiation và nhóm khác có endpoint.

Trước mỗi màn hình, xác định mock hiện tại, endpoint/method/auth, request/query, response và errors. Chỉ thay mock khi contract đủ rõ. Endpoint chưa có hoặc chưa dùng được thì giữ mock được đánh dấu, không tự tạo URL.

## 8. Kiểm thử và báo cáo

- Chạy test phù hợp sau mỗi giai đoạn; cuối cùng chạy `flutter pub get` nếu cần, `flutter analyze` và test hiện hữu phù hợp (ví dụ `flutter test`).
- Test parsing null, string ID, decimal/numeric, date, timestamp, empty list, lỗi HTTP và response envelope.
- Không ghi dữ liệu production để xác minh. Dùng mocks/stubs/test environment hoặc GET read-only nếu phù hợp.
- Báo cáo file đã sửa, flows/endpoints, mock còn lại và lý do, commands/tests thực sự chạy cùng kết quả, lỗi còn lại và contract mismatch.

## 9. Ranh giới

- Không sửa backend/database, không push/commit hoặc deploy.
- Không xóa/refactor chức năng ngoài phạm vi; giữ thay đổi người dùng.
- Không thêm endpoint, field, token flow, status transition hoặc business rule không được xác minh.
- Không đưa credentials/token/password/PII vào source, logs, snapshots hoặc docs.
- Đánh dấu hành vi chưa có bằng chứng `NOT VERIFIED`, `NOT IMPLEMENTED` hoặc `NEEDS RUNTIME TEST`.
