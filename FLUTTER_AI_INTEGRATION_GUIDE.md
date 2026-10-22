# Flutter Integration Guide — Hotel Booking API

Tài liệu này mô tả contract theo router được mount ở `src/app.js`, handler hiện có, JWT middleware và email service. Không phải xác nhận production đang hoạt động. Base URL production do dự án cung cấp là `https://hotel-booking-backend-fz9h.onrender.com`; cần kiểm tra cấu hình môi trường trước khi dùng.

## Quy tắc tích hợp

- JSON request dùng `Content-Type: application/json`; Express JSON limit 1 MB.
- JWT gửi `Authorization: Bearer <token>` cho route bảo vệ. Token chứa `id`, hết hạn sau 7 ngày. Logout chỉ trả lời client xóa token; không thu hồi token ở server.
- `optionalAuth` cho phép gọi không token; nếu gửi token hỏng thì nhận 401.
- Giữ ID user ở dạng UUID và các ID hotel/room/booking/payment dưới dạng chuỗi. Giá PostgreSQL `numeric` có thể về JSON dưới dạng chuỗi; ngày dùng `YYYY-MM-DD`.
- Không có API posts, search users, profile người khác, upload ảnh, refresh token, FCM, hotel search hay pagination trong source hiện tại.

## Endpoint theo nhóm

| Nhóm | API thực tế và auth |
|---|---|
| Health | `GET /`, `GET /api/test-db` (public) |
| Auth | `POST /api/auth/register`, `POST /api/auth/login` (public); `POST /api/auth/logout`, `GET /api/auth/me` (JWT) |
| Profile | `GET /api/users/me`, `PUT /api/users/me` (JWT; PUT chỉ `full_name`, `phone`, `avatar`) |
| Hotels | `GET /api/hotels`, `GET /api/hotels/{id}`, `/images`, `/amenities`, `/vibes`, `/room-types` (public); `GET /api/hotels/{id}/reviews` optional JWT; `POST /api/hotels/{id}/reviews` JWT |
| Room types | `GET /api/room-types/{id}`, `/{id}/images`, `/{id}/rooms` (public) |
| Rooms | `GET /api/rooms`, `GET /api/rooms/{id}`, `GET /api/rooms/available` (public) |
| Bookings | `POST /api/bookings`, `GET /api/bookings`, `GET /api/bookings/{id}`, `PATCH /api/bookings/{id}/cancel`, `POST /api/bookings/{id}/check-in`, `GET /api/bookings/{id}/qr`, `GET/POST /api/bookings/{id}/guests`, `GET /api/bookings/{id}/payments` (JWT) |
| Guests | `PUT /api/guests/{id}`, `DELETE /api/guests/{id}` (JWT) |
| Payments | `POST /api/payments`, `GET /api/payments/{id}`, `GET /api/payments/{id}/qr`, `POST /api/payments/{id}/simulate` (JWT; simulate ayrıca `PAYMENT_MODE=mock`) |
| Notifications | `GET /api/notifications` (JWT) |
| Vouchers | `GET /api/vouchers`, `GET /api/vouchers/{code}`, `POST /api/vouchers/validate` (public) |
| Favorites | `GET /api/favorites`, `POST /api/favorites/{hotel_id}`, `DELETE /api/favorites/{hotel_id}` (JWT) |
| Reviews | `POST /api/reviews`, `PUT /api/reviews/{id}`, `DELETE /api/reviews/{id}` (JWT) |

Chi tiết field/response của mọi route nằm trong [API reference](HOTEL_BOOKING_API_DOCUMENT.md). Route catalog phản ánh source; schema có thể làm route trả lỗi runtime.

## Luồng sử dụng

1. **Đăng ký/đăng nhập:** register body gồm `full_name,email,phone,password`; password tối thiểu 8 ký tự. Login nhận `email,password`. JWT có thời hạn 7 ngày.
2. **Khám phá:** tải danh sách hotel, ảnh catalog, tiện ích, vibes, room types; có thể gọi `GET /api/rooms/available?hotel_id=...&check_in=YYYY-MM-DD&check_out=YYYY-MM-DD&room_type_id=...`. Đây là danh sách phòng vật lý có sẵn tại lúc truy vấn.
3. **Tạo booking:** `POST /api/bookings` cần `hotel_id,room_ids,check_in,check_out,adults,booking_email`; `children` mặc định 0, `voucher_code` tùy chọn. `room_ids` là ID phòng vật lý. Backend tự tính tiền và kiểm tra overlap lại. Email phải đúng định dạng và domain phải có MX hoặc A record; DNS không xác minh hộp thư. Booking lưu tổng guest count, không lưu tách adults/children; tax hiện bằng 0.
4. **Thanh toán demo:** `POST /api/payments` nhận `booking_id,payment_method` (`card`/`qr`); không gửi dữ liệu thẻ. Trả 409 nếu booking đã paid hoặc đã có payment pending. QR endpoint chỉ trả text demo, scan QR không xác nhận thanh toán. Simulate chỉ dùng trên môi trường demo khi server bật mock.
5. **Email thanh toán:** khi `POST /api/payments/{id}/simulate` với `result:"success"` payment và booking được commit lần lượt thành `paid`/`confirmed`; sau commit backend thử ghi notification và gọi SMTP độc lập. Notification lỗi không rollback payment hay ngăn email. Response thêm `email.status`: `sent`, `failed`, hoặc `not_sent`. Lỗi SMTP không đổi trạng thái `paid`. Payment hoàn tất trước đó không gửi email lại. Source hiện không có callback từ cổng thanh toán thật.
6. **Booking của tôi:** `/api/bookings` chỉ trả booking của JWT user. History có hotel name, room list, totals/status và payment summary; không nhúng guest names hoặc hotel image. Dùng subroutes guest/payment khi cần.
7. **Check-in:** booking QR/token không phải xác nhận payment. Check-in chỉ thành công với booking confirmed đúng ngày nhận phòng.

## Trạng thái và lỗi cần xử lý

- Availability dùng khoảng `[check_in,check_out)`; booking mọi trạng thái trừ `cancelled` chiếm phòng. Pending, kể cả payment failed, không tự hết hạn và vẫn block.
- Các route thường dùng HTTP `400`, `401`, `403`, `404`, `409`, `500`; tạo booking có thể trả `503` nếu DNS lỗi tạm thời. Error message không có mã chuẩn hóa. Hiển thị lỗi từ server; không đánh dấu thao tác thành công trước response thành công.
- Review chỉ tạo được cho booking thuộc user, cùng hotel, trạng thái `completed` hoặc `checked_in`; rating 1–5. Review này khác bài viết trải nghiệm.

## Blocker và điều chưa xác minh

- Metadata local đã đọc trước đây cho thấy `users.id` UUID không có default, nhưng register source không truyền `id`; login source cập nhật `users.last_login_at` trong khi metadata đó không có cột này. Hai luồng auth chưa được xác nhận chạy với schema local đó.
- `POST /api/bookings` ghi `bookings.booking_email`; migration `002_add_booking_email.sql` tạo cột. Metadata local đọc gần nhất không có cột này. Cần schema phù hợp ở môi trường tích hợp.
- Payment success ghi `notifications.content` sau commit; migration `001_create_notifications.sql` tạo bảng/cột này. Metadata local đọc gần nhất không có bảng notifications; khi chưa tạo, notification bị bỏ qua sau log nhưng payment vẫn paid và email vẫn được thử gửi.
- `GET /api/notifications` trả key `message` bằng alias từ cột database `content`, khớp migration hiện tại. Route vẫn cần bảng notifications tồn tại để hoạt động.
- Chưa gọi production, chưa xác minh Render environment/schema/SMTP, và chưa có integration test DB/email trong cập nhật tài liệu này. SMTP credentials không đưa vào Flutter.

Các blockers trên dựa trên source và metadata local đã đọc; không khẳng định schema production giống local. Xem [API reference](HOTEL_BOOKING_API_DOCUMENT.md) để biết response và lỗi chi tiết. Không tự thêm endpoint hoặc field không có trong backend.
