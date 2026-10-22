# Hotel Booking REST API

> API contract tổng hợp trực tiếp từ `src/app.js`, `src/routes/`, middleware và email service. Route có trong source không đồng nghĩa route đã chạy thành công với database. Không có request production nào được thực hiện.

## 1. Quy ước chung

- Base URL production do dự án cung cấp: `https://hotel-booking-backend-fz9h.onrender.com`; chưa xác minh khả dụng. Các route API dùng prefix `/api`, trừ `GET /`.
- Body JSON dùng `Content-Type: application/json`. Express nhận JSON tối đa 1 MB và cũng bật URL encoded.
- JWT gửi bằng `Authorization: Bearer <JWT>`. `requireAuth` lấy `req.user.id` từ JWT; token được ký bằng `JWT_SECRET`, thời hạn 7 ngày. Logout không thu hồi token; ứng dụng cần xóa token cục bộ. `optionalAuth` cho phép thiếu token, nhưng nếu gửi token không hợp lệ thì trả 401.
- ID user là UUID; nhiều ID nghiệp vụ khác là chuỗi. PostgreSQL `numeric` thường được `pg` trả về dạng chuỗi.
- Lỗi thường có dạng `{ "success": false, "message": "..." }`. Không có mã lỗi ứng dụng thống nhất.

## 2. Endpoint catalog theo source

| Method | Endpoint | Auth | Request | Response / lỗi chính |
|---|---|---|---|---|
| GET | `/` | Public | — | 200 `{success,message}` |
| GET | `/api/test-db` | Public | — | 200 `{success,data:{current_time}}`; 500 DB |
| POST | `/api/auth/register` | Public | `full_name,email,phone,password` | 201 `{success,message,user}`; 400 validation; 409 email/phone trùng; 500 DB |
| POST | `/api/auth/login` | Public | `email,password` | 200 `{success,token,data:user}`; 400 body; 401 sai credentials; 500 DB/config |
| POST | `/api/auth/logout` | JWT | — | 200 message; không revoke JWT |
| GET | `/api/auth/me` | JWT | — | 200 profile; 404 user; 500 DB |
| GET | `/api/users/me` | JWT | — | 200 profile; 404 user; 500 DB |
| PUT | `/api/users/me` | JWT | `full_name?`, `phone?`, `avatar?` | 200 profile; 400 field lạ; 404 user; 500 DB |
| GET | `/api/hotels` | Public | — | 200 hotel array; 500 DB |
| GET | `/api/hotels/{id}` | Public | path `id` | 200 hotel; 404; 500 DB |
| GET | `/api/hotels/{id}/images` | Public | path `id` | 200 image array; 500 DB |
| GET | `/api/hotels/{id}/amenities` | Public | path `id` | 200 array; 500 DB |
| GET | `/api/hotels/{id}/vibes` | Public | path `id` | 200 array; 500 DB |
| GET | `/api/hotels/{id}/room-types` | Public | path `id` | 200 room type array; 500 DB |
| GET | `/api/hotels/{id}/reviews` | Optional JWT | path `id` | 200 review array; 401 invalid supplied token; 500 DB |
| POST | `/api/hotels/{id}/reviews` | JWT | `booking_id,rating,comment?` | 201 review; 400 input; 403 booking không đủ điều kiện; 409 review trùng booking; 500 DB |
| GET | `/api/room-types/{id}` | Public | path `id` | 200 room type; 404; 500 DB |
| GET | `/api/room-types/{id}/images` | Public | path `id` | 200 image array; 500 DB |
| GET | `/api/room-types/{id}/rooms` | Public | path `id` | 200 physical room array; 500 DB |
| GET | `/api/rooms` | Public | query `hotel_id?`, `room_type_id?`, `status?` | 200 room array; 500 DB |
| GET | `/api/rooms/{id}` | Public | path `id` | 200 room; 404; 500 DB |
| GET | `/api/rooms/available` | Public | `hotel_id,check_in,check_out,room_type_id?` | 200 available physical rooms; 400 dates/input; 500 DB |
| POST | `/api/bookings` | JWT | booking body ở mục 3 | 201 booking; 400 validation/room/voucher; 401; 404 FK; 409 conflict; 503 lỗi kiểm tra DNS; 500 DB |
| GET | `/api/bookings` | JWT | — | 200 owned booking history; 500 DB |
| GET | `/api/bookings/{id}` | JWT | path `id` | 200 owned booking; 404; 500 DB |
| PATCH | `/api/bookings/{id}/cancel` | JWT | — | 200 `{id,status}`; 404; 409 trạng thái không cho hủy; 500 DB |
| POST | `/api/bookings/{id}/check-in` | JWT | — | 200 `{id,status,checked_in_at}`; 404; 409 trạng thái/ngày không hợp lệ; 500 DB |
| GET | `/api/bookings/{id}/qr` | JWT | path `id` | 200 booking QR data; 404; 500 DB |
| GET | `/api/bookings/{id}/guests` | JWT | path `id` | 200 guest array; 404 booking không thuộc user; 500 DB |
| POST | `/api/bookings/{id}/guests` | JWT | `full_name,phone?,email?,identification_info?` | 201 guest; 400 thiếu tên; 404 booking không thuộc user; 500 DB |
| GET | `/api/bookings/{id}/payments` | JWT | path `id` | 200 payment array; 404 booking không thuộc user; 500 DB |
| PUT | `/api/guests/{id}` | JWT | guest fields tùy chọn | 200 `{success,message,data}`; 404 guest không thuộc booking của user; 500 DB |
| DELETE | `/api/guests/{id}` | JWT | path `id` | 200 message; 404 guest không thuộc booking của user; 500 DB |
| POST | `/api/payments` | JWT | `booking_id,payment_method` (`card`/`qr`) | 201 pending payment; 400 input; 404 booking; 409 booking đã trả/không hợp lệ/đã có payment pending; 500 DB |
| GET | `/api/payments/{id}` | JWT | path `id` | 200 owned payment; 404; 500 DB |
| GET | `/api/payments/{id}/qr` | JWT | path `id` | 200 QR text, chỉ payment method `qr`; 404; 409 method khác; 500 DB |
| POST | `/api/payments/{id}/simulate` | JWT + `PAYMENT_MODE=mock` | `result: "success"\|"failed"` | 200 payment + `email.status`; 400 input; 403 mock disabled; 404 payment; 409 already completed/ineligible; 500 transaction/DB |
| GET | `/api/notifications` | JWT | — | Source trả notification array; 500 DB/schema mismatch có thể xảy ra |
| GET | `/api/vouchers` | Public | — | 200 voucher active và còn hạn; 500 DB |
| GET | `/api/vouchers/{code}` | Public | path `code` | 200 voucher kể cả inactive/expired; 404; 500 DB |
| POST | `/api/vouchers/validate` | Public | `code,subtotal` | 200 voucher/discount/total; 400 invalid/inactive/minimum; 404; 500 DB |
| GET | `/api/favorites` | JWT | — | 200 current user's hotel favorites; 500 DB |
| POST | `/api/favorites/{hotel_id}` | JWT | path `hotel_id` | 201 favorite; 404 hotel; 409 đã favorite; 500 DB |
| DELETE | `/api/favorites/{hotel_id}` | JWT | path `hotel_id` | 200 message; 404; 500 DB |
| POST | `/api/reviews` | JWT | `hotel_id,booking_id,rating,comment?` | 201 review; 400 input; 403 booking không đủ điều kiện; 404 FK; 409 trùng booking; 500 DB |
| PUT | `/api/reviews/{id}` | JWT | `rating?`, `comment?` (ít nhất một) | 200 review; 400 input; 404 không thuộc user/không có; 500 DB |
| DELETE | `/api/reviews/{id}` | JWT | path `id` | 200 message; 404 không thuộc user/không có; 500 DB |

Không có route posts, user search, profile người dùng khác, upload ảnh, pagination, refresh token, hay FCM trong source được mount.

## 3. Chi tiết request/response

### Đăng ký, đăng nhập và profile

`POST /api/auth/register` yêu cầu cả bốn trường chuỗi `full_name,email,phone,password`; email chuẩn hóa lowercase/trim, password tối thiểu 8 ký tự. Trả `201 {success:true,message,user:{id,email,full_name,phone,avatar,created_at}}`. Email hoặc phone đã dùng trả 409 và có thể kèm `errors` theo field. Source insert không truyền `users.id`; metadata DB đã kiểm tra trước đây cho thấy cột này không có default. Vì vậy response 201 là response dự kiến theo source, không phải đảm bảo đăng ký chạy với mọi DB.

`POST /api/auth/login` nhận `{email,password}` và dự kiến trả `200 {success:true,token,data:user}` với JWT 7 ngày. Sai credentials `401`; body thiếu/không hợp lệ `400`. Handler cập nhật `users.last_login_at`; metadata DB đã kiểm tra trước đây không có cột này, nên login có thể trả 500 cho database đó.

`GET /api/auth/me` và `GET /api/users/me` trả `{success:true,data:{id,email,full_name,phone,avatar,created_at}}`. `PUT /api/users/me` chỉ nhận `full_name`, `phone`, `avatar`; body key khác trả 400. Giá trị null/thiếu được giữ nguyên bởi `COALESCE`, không dùng để xóa giá trị hiện tại.

### Khách sạn, phòng và ảnh catalog

Hotel fields: `id,name,description,address,city,latitude,longitude,star_rating,created_at`. Hotel image: `id,hotel_id,image_url,ordering`. Amenities/vibes trả các trường `id,name,description`. Room type: `id,hotel_id,name,description,max_guests,base_price`. Room: `id,hotel_id,room_type_id,room_number,status`. Các API ảnh chỉ đọc URL ảnh catalog; không có API upload.

`GET /api/rooms/available` yêu cầu `hotel_id`, `check_in`, `check_out`; hỗ trợ `room_type_id`. Ngày theo `YYYY-MM-DD`, checkout sau checkin. Kết quả chỉ gồm phòng vật lý `active` và không overlap; không phải inventory room type.

### Đặt phòng

`POST /api/bookings` yêu cầu JWT và body:

```json
{
  "hotel_id": "<hotel-id>",
  "room_ids": ["<room-id>"],
  "check_in": "2030-05-10",
  "check_out": "2030-05-12",
  "adults": 2,
  "children": 0,
  "voucher_code": "<optional-code>",
  "booking_email": "guest@example.com"
}
```

`booking_email` là bắt buộc, được lưu riêng trên booking, kiểm tra format và DNS MX (A record dự phòng). DNS không xác nhận mailbox tồn tại. MX không có trả 400; lỗi DNS tạm thời trả 503. Server kiểm tra phòng thuộc hotel, active, capacity, overlap và voucher; tính giá, tax hiện là 0. Success trả `201 {success:true,data:{id,booking_code,user_id,hotel_id,voucher_id,check_in,check_out,number_of_guests,subtotal,tax,discount,total_amount,status,qr_token,booking_email,created_at,rooms:[{room_id,price_per_night,number_of_nights,subtotal}]}}`; trạng thái đầu `pending`.

Route ghi `booking_email`; migration tương ứng là `migrations/002_add_booking_email.sql`. Metadata local đã kiểm tra không hiển thị cột này, vì vậy việc tạo booking với database đó chưa được xác minh thành công nếu migration chưa chạy.

`GET /api/bookings` trả lịch sử của user hiện tại gồm hotel name, dates, totals/status, rooms và `payment_status/payment_method` mới nhất. `GET /api/bookings/{id}` trả chi tiết owned booking cùng room list. Các route con guests/payments cũng giới hạn theo owner.

Availability dùng khoảng `[check_in, check_out)`. Booking có status khác `cancelled`, kể cả pending hoặc payment failed, vẫn chặn phòng; không có expiry.

### Thanh toán, email và notification

`POST /api/payments` nhận `{booking_id,payment_method}` (`card` hoặc `qr`); amount lấy từ booking, client amount bị bỏ qua. Tạo payment `pending`, không phải charge thật. Từ chối nếu booking đã paid hoặc đã có payment pending.

`GET /api/payments/{id}/qr` trả `payment_id,booking_id,booking_code,amount,payment_status,qr_content`. Đây là text demo, không phải hướng dẫn chuyển khoản thật. QR scan không cập nhật payment.

`POST /api/payments/{id}/simulate` chỉ hoạt động khi `PAYMENT_MODE=mock`. Với `result="success"`, source cập nhật payment thành `paid` và booking pending thành `confirmed`, rồi COMMIT. Sau commit, notification và email được thử gửi độc lập; notification lỗi không rollback payment. Email được gửi tới `bookings.booking_email`. Response có dạng:

```json
{
  "success": true,
  "data": { "id": "<payment-id>", "booking_id": "<booking-id>", "payment_method": "card", "transaction_id": "<transaction-id>", "amount": "2500.00", "status": "paid", "paid_at": "<timestamp>" },
  "email": { "status": "sent", "message": "Confirmation email sent" }
}
```

`email.status` có thể là `sent`, `failed`, hoặc `not_sent` khi booking không có email. Lỗi SMTP không rollback payment; lỗi được log theo mã lỗi. Với `result="failed"`, payment thành `failed`, email có status `not_applicable`. Payment đã hoàn tất trả 409 và không gửi lại email. Hiện source chỉ có mock simulate flow, không thấy webhook/callback của cổng thanh toán thật.

Service dùng `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_APP_PASSWORD` từ môi trường (host/port có default Gmail/587). Không ghi credentials vào client. Email gồm mã booking/payment, hotel, ngày nhận/trả phòng, tổng tiền.

**Schema cần lưu ý:** database local đọc gần nhất thiếu `bookings.booking_email` và bảng `notifications`. Thiếu `booking_email` làm truy vấn simulate lỗi cho tới khi migration `002_add_booking_email.sql` được áp dụng. Thiếu bảng notifications hiện chỉ làm thao tác ghi notification thất bại sau commit; payment vẫn paid và email vẫn được thử gửi. Migration `001_create_notifications.sql` định nghĩa `content`; route GET giữ response field `message` bằng cách select `content AS message`. Chưa xác minh schema production.

### Guests, favorites, vouchers, reviews

Guest create body `full_name` bắt buộc, các trường còn lại tùy chọn; sửa guest nhận các trường tùy chọn và `COALESCE` giữ giá trị cũ khi null. Chỉ thao tác guest gắn với booking hiện tại của JWT user.

Voucher validate nhận `{code,subtotal}`; discount phần trăm nếu `discount_type="percent"`, ngược lại là giá trị cố định, không vượt subtotal. Endpoint này chỉ preview; booking validate lại.

Review là đánh giá hotel có chứng minh booking. `rating` từ 1–5; booking phải thuộc user, đúng hotel, trạng thái `completed` hoặc `checked_in`. DB có unique review theo `booking_id`. `comment` có thể null. `PUT /api/reviews/{id}` không xóa comment bằng null vì dùng `COALESCE`.

## 4. Các lỗi và giới hạn đã biết

- `400`: validation/body, ngày, phòng/voucher không hợp lệ; JSON parse lỗi toàn app trả `Invalid JSON request body`.
- `401`: thiếu/sai/hết hạn JWT; login sai credentials. `requireAuth` trả 500 nếu thiếu `JWT_SECRET`.
- `403`: mock mode tắt hoặc booking không đủ điều kiện review/payment.
- `404`: tài nguyên không có/không thuộc user/FK target không tồn tại.
- `409`: booking/payment state conflict, trùng favorite/review, phòng bị đặt.
- `500`: lỗi DB hoặc handler; không có error code ứng dụng ổn định.
- `503`: DNS provider không kiểm tra email domain được tạm thời khi tạo booking.

Database metadata được đọc ở local trước đây, không phải production. Route source và migration không chứng minh production schema đã áp dụng. Không có production request hoặc end-to-end test trong lần cập nhật tài liệu này.

## 5. Cấu hình và file liên quan

- DB: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.
- Auth: `JWT_SECRET`.
- Demo payment: `PAYMENT_MODE=mock`.
- Email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_APP_PASSWORD`.
- Source: `src/app.js`, `src/routes/*.js`, `src/middleware/auth.js`, `src/services/paymentEmailService.js`.
- Migrations liên quan: `migrations/001_create_notifications.sql`, `migrations/002_add_booking_email.sql`.
- Related docs: `FLUTTER_AI_INTEGRATION_GUIDE.md`, `IMPLEMENT_FLUTTER_API_PROMPT.md`, `openapi.yaml`.
