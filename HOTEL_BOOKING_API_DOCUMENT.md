# Tài liệu API Hotel Booking

## 1. Tổng quan

- **Dự án:** Hotel Booking API
- **Backend:** Node.js, Express.js, PostgreSQL (`pg`)
- **Hosting:** Render (theo thông tin cung cấp)
- **Production Base URL:** `https://hotel-booking-backend-fz9h.onrender.com`
- **Định dạng:** JSON; gửi JSON body với `Content-Type: application/json`.
- **Trạng thái:** Có 44 operation (method + path) trong source và OpenAPI. 7 test auth chạy thành công local với DB stub; production chưa được gọi. URL được cung cấp không phải bằng chứng rằng endpoint production đang hoạt động.

`Student App API(1).pdf` không có trong workspace. Tài liệu sử dụng tiêu chuẩn trình bày được mô tả trong yêu cầu, không tuyên bố đã đọc PDF.

### Nhãn

- **VERIFIED FROM SOURCE:** Có implementation được đối chiếu trong repo.
- **VERIFIED BY RUNTIME TEST:** Hành vi có test cục bộ; không đồng nghĩa production đã test.
- **NEEDS RUNTIME TEST:** Có source implementation nhưng chưa xác minh bằng DB/Render thực tế.
- **NOT IMPLEMENTED:** Không tìm thấy implementation tương ứng.
- **NOT VERIFIED:** Chưa đủ căn cứ xác nhận.

Các endpoint dưới đây có trạng thái **VERIFIED FROM SOURCE; NEEDS RUNTIME TEST**, trừ hành vi auth có ghi rõ test local. Không có endpoint nào được khẳng định đã chạy thành công trên Render.

## 2. Bắt đầu nhanh

1. `GET /` trả health message của Express, không kiểm tra PostgreSQL.
2. Đăng ký qua `POST /api/auth/register`, hoặc đăng nhập qua `POST /api/auth/login`.
3. Login trả JWT trong `token`; gửi `Authorization: Bearer <token>` cho route yêu cầu đăng nhập.
4. `GET /api/hotels` lấy danh sách khách sạn; hiện không có query search/filter.

```bash
curl -X POST "https://hotel-booking-backend-fz9h.onrender.com/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"<email>","password":"<password>"}'
```

```bash
curl "https://hotel-booking-backend-fz9h.onrender.com/api/bookings" \
  -H "Authorization: Bearer <token>"
```

Placeholder không phải tài khoản hay dữ liệu production.

## 3. Endpoint catalog

Đếm theo cặp method/path: **44 source, 44 OpenAPI**. Source tồn tại không chứng minh runtime production.

| Method | Endpoint | Chức năng | Authentication | Trạng thái |
|---|---|---|---|---|
| GET | `/` | Health message | Không | Source; needs runtime |
| GET | `/api/test-db` | Thử kết nối PostgreSQL | Không | Source; needs runtime |
| POST | `/api/auth/register` | Đăng ký | Không | Source; local auth test |
| POST | `/api/auth/login` | Login, cấp JWT | Không | Source; local auth test |
| POST | `/api/auth/logout` | Logout phía client | Bearer JWT | Source; local auth test |
| GET | `/api/auth/me` | Hồ sơ từ token | Bearer JWT | Source; local auth test |
| GET | `/api/users/me` | Đọc hồ sơ | Bearer JWT | Source |
| PUT | `/api/users/me` | Sửa hồ sơ | Bearer JWT | Source |
| GET | `/api/hotels` | Danh sách hotels | Không | Source |
| GET | `/api/hotels/{id}` | Hotel detail | Không | Source |
| GET | `/api/hotels/{id}/images` | Ảnh hotel | Không | Source |
| GET | `/api/hotels/{id}/amenities` | Amenities | Không | Source |
| GET | `/api/hotels/{id}/vibes` | Vibe tags | Không | Source |
| GET | `/api/hotels/{id}/room-types` | Room types của hotel | Không | Source |
| GET | `/api/hotels/{id}/reviews` | Reviews của hotel | Optional; token nếu gửi phải hợp lệ | Source |
| POST | `/api/hotels/{id}/reviews` | Tạo review | Bearer JWT | Source |
| GET | `/api/room-types/{id}` | Room type detail | Không | Source |
| GET | `/api/room-types/{id}/images` | Ảnh room type | Không | Source |
| GET | `/api/room-types/{id}/rooms` | Rooms theo room type | Không | Source |
| GET | `/api/rooms` | Danh sách phòng/lọc | Không | Source |
| GET | `/api/rooms/available` | Phòng trống theo ngày | Không | Source |
| GET | `/api/rooms/{id}` | Room detail | Không | Source |
| POST | `/api/bookings` | Tạo booking | Bearer JWT | Source |
| GET | `/api/bookings` | Booking history | Bearer JWT | Source |
| GET | `/api/bookings/{id}` | Booking detail | Bearer JWT | Source |
| GET | `/api/bookings/{id}/guests` | Guest list của booking | Bearer JWT | Source |
| POST | `/api/bookings/{id}/guests` | Thêm guest | Bearer JWT | Source |
| GET | `/api/bookings/{id}/payments` | Payment list của booking | Bearer JWT | Source |
| GET | `/api/bookings/{id}/qr` | QR token booking | Bearer JWT | Source |
| PATCH | `/api/bookings/{id}/cancel` | Hủy booking | Bearer JWT | Source |
| POST | `/api/bookings/{id}/check-in` | Check-in | Bearer JWT | Source |
| PUT | `/api/guests/{id}` | Sửa guest | Bearer JWT | Source |
| DELETE | `/api/guests/{id}` | Xóa guest | Bearer JWT | Source |
| POST | `/api/payments` | Tạo payment pending | Bearer JWT | Source |
| GET | `/api/payments/{id}` | Payment detail | Bearer JWT | Source |
| GET | `/api/vouchers` | Voucher đang active | Không | Source |
| POST | `/api/vouchers/validate` | Validate voucher | Không | Source |
| GET | `/api/vouchers/{code}` | Tra voucher | Không | Source |
| GET | `/api/favorites` | Favorite list | Bearer JWT | Source |
| POST | `/api/favorites/{hotel_id}` | Thêm favorite | Bearer JWT | Source |
| DELETE | `/api/favorites/{hotel_id}` | Xóa favorite | Bearer JWT | Source |
| POST | `/api/reviews` | Tạo review, hotel ID trong body | Bearer JWT | Source |
| PUT | `/api/reviews/{id}` | Sửa review | Bearer JWT | Source |
| DELETE | `/api/reviews/{id}` | Xóa review | Bearer JWT | Source |

Mount point: [src/app.js](src/app.js). Implementation ở [src/routes](src/routes). Không có route search hotel riêng.

## 4. Authentication và tài khoản

### `POST /api/auth/register`

- **Auth:** Không. **Body bắt buộc:** `email`, `password`, `full_name`, `phone`; tất cả string không rỗng. Email trim/lowercase và regex cơ bản; password tối thiểu 8 ký tự.
- **201:** `{ "success": true, "message": "...", "user": { "id", "email", "full_name", "phone", "avatar", "created_at" } }`.
- **Lỗi:** `400` thiếu/sai input; `409` email/phone duplicate (có thể có `errors`); `500` lỗi đăng ký.
- Password hash bcryptjs cost 12; hash không trả về. Register không cấp token.
- **OpenAPI lệch source:** OpenAPI yêu cầu email/password, cho full_name/phone nullable, min password 6; source bắt buộc đủ 4 trường và min 8. OpenAPI response dùng `data`, source dùng `user`.
- **Test:** Local test xác minh register 201, validation, duplicate, bcrypt hash và không lộ hash; DB được stub, chưa xác minh production.

```json
{"email":"<email>","password":"<at-least-8-characters>","full_name":"<full-name>","phone":"<phone>"}
```

### `POST /api/auth/login`

- **Auth:** Không. Body: `email`, `password` string không rỗng.
- **200:** `{ "success": true, "token": "<jwt>", "data": { "id", "email", "full_name", "phone", "avatar", "created_at" } }`.
- **Lỗi:** `400` input thiếu; `401` credentials không chính xác; `500` lỗi login hoặc thiếu cấu hình `JWT_SECRET`.
- Token được ký từ `{id:user.id}`, `expiresIn: "7d"`; middleware yêu cầu Bearer và `id` trong payload. Không có refresh token.
- Local test kiểm tra login/JWT, lỗi unknown email và sai password giống nhau, không lộ hash; chưa test production.

### `POST /api/auth/logout`

- **Auth:** Bearer JWT; body không cần. **200:** `{success:true,message}`. **401:** token thiếu/không hợp lệ/hết hạn; **500:** JWT secret thiếu.
- JWT stateless, không revoke phía server. Client phải xóa token; token có thể sử dụng đến khi hết hạn.

### `GET /api/auth/me`, `GET /api/users/me`

- **Auth:** Bearer JWT. **200:** `{success:true,data:{id,email,full_name,phone,avatar,created_at}}`.
- **Lỗi:** `401`, `404` không tìm thấy user, `500`. Hai route có chức năng đọc hồ sơ trùng nhau.

### `PUT /api/users/me`

- **Auth:** Bearer JWT. **Body:** chỉ cho phép `full_name`, `phone`, `avatar`; có thể gửi rỗng. Field lạ gây `400`; null giữ nguyên giá trị cũ qua `COALESCE`.
- **200:** `{success:true,data:{id,email,full_name,phone,avatar,created_at}}`. **Lỗi:** `400`, `401`, `404`, `500`.

Ví dụ JavaScript:

```js
const response = await fetch(
  "https://hotel-booking-backend-fz9h.onrender.com/api/auth/me",
  { headers: { Authorization: `Bearer ${token}` } }
);
const result = await response.json();
```

## 5. Hotels, search, images, amenities, vibes

### `GET /api/hotels`

- **Auth/query:** Không cần auth; implementation không đọc query.
- **200:** `{success:true,data:[{id,name,description,address,city,latitude,longitude,star_rating,created_at}]}`, sort theo id. **500:** lỗi lấy hotels.
- **Search/filter/pagination/sort theo query:** **NOT IMPLEMENTED**. Không gửi query city, date, price, rating, amenities, vibes với giả định chúng có tác dụng.

### `GET /api/hotels/{id}`

- **200:** `{success:true,data:{id,name,description,address,city,latitude,longitude,star_rating,created_at}}`.
- **404:** không có hotel; **500:** lỗi DB. Path id truyền vào query; định dạng ID từ schema DB chưa xác minh.

### `GET /api/hotels/{id}/images`

- **200:** `{success:true,data:[{id,hotel_id,image_url,ordering}]}`, sort theo ordering. Không tìm thấy hotel không nhất thiết trả 404; có thể data rỗng. **500** khi query lỗi.

### `GET /api/hotels/{id}/amenities`, `GET /api/hotels/{id}/vibes`

- **200:** `{success:true,data:[{id,name,description}]}`; cả hai sort theo name. **500** khi DB lỗi; không kiểm tra hotel existence riêng.

Ảnh, amenities, vibes, room types được cung cấp bởi endpoint riêng. Không thấy API riêng cho hotel search/filter.

## 6. Room types, rooms, availability

### `GET /api/hotels/{id}/room-types`

- **200:** `{success:true,data:[{id,hotel_id,name,description,max_guests,base_price}]}`. **500** nếu DB lỗi; kết quả rỗng không phải 404.

### `GET /api/room-types/{id}`

- **200:** `{success:true,data:{id,hotel_id,name,description,max_guests,base_price}}`; **404**, **500**.

### `GET /api/room-types/{id}/images`

- **200:** `{success:true,data:[{id,room_type_id,image_url,ordering}]}` theo ordering; **500**.

### `GET /api/room-types/{id}/rooms`

- **200:** `{success:true,data:[{id,hotel_id,room_type_id,room_number,status}]}` theo room_number; **500**.

### `GET /api/rooms`

- Query tùy chọn: `hotel_id`, `room_type_id`, `status`; filter được nối AND. **200:** `{success:true,data:[{id,hotel_id,room_type_id,room_number,status}]}`. **500**.

### `GET /api/rooms/{id}`

- **200:** cùng object room ở trên; **404** không tìm thấy; **500**.

### `GET /api/rooms/available`

- Query bắt buộc: `hotel_id`, `check_in`, `check_out` (`YYYY-MM-DD`); `room_type_id` tùy chọn. Checkout phải sau checkin.
- **200:** `{success:true,data:[{id,hotel_id,room_type_id,room_number,status,room_type_name,max_guests,base_price}]}`.
- Chỉ chọn room `active`; loại các room có booking khác overlap, trừ status cancelled. **400** input/ngày sai; **500** DB lỗi.
- Đây là truy vấn availability; booking vẫn tự kiểm tra overlap trong transaction. Đồng thời/concurrency cần runtime test.

## 7. Booking, history, check-in

Tất cả route `/api/bookings` dùng `requireAuth`.

### `POST /api/bookings`

- Body bắt buộc: `hotel_id`, `room_ids` (mảng không rỗng, không trùng), `check_in`, `check_out`, `adults` (integer >= 1). `children` mặc định 0, nếu gửi phải integer >= 0; `voucher_code` tùy chọn.
- Validation: ngày `YYYY-MM-DD`, checkout sau checkin; các phòng thuộc hotel, active, không overlap booking chưa canceled; tổng khách không quá tổng sức chứa. Giá = base_price * số đêm. Voucher phải active/trong ngày hợp lệ và đạt min_order; discount không vượt subtotal.
- **201:** `{success:true,data:{id,booking_code,user_id,hotel_id,voucher_id,check_in,check_out,adults,children,subtotal,discount_amount,total_amount,status,qr_token,created_at,rooms:[{room_id,price_per_night,number_of_nights,subtotal}]}}`; status ban đầu `pending`.
- **Lỗi:** `400` input/ownership/capacity/voucher; `401`; `404` liên kết DB không tồn tại; `409` room inactive/overlap; `500` lỗi khác.
- OpenAPI BookingRoom khai báo thêm room_number/room_type_id tùy chọn; response tạo booking hiện không trả hai field này.

```bash
curl -X POST "https://hotel-booking-backend-fz9h.onrender.com/api/bookings" \
  -H "Content-Type: application/json" -H "Authorization: Bearer <token>" \
  -d '{"hotel_id":"<hotel-id>","room_ids":["<room-id>"],"check_in":"2030-05-10","check_out":"2030-05-12","adults":2,"children":0}'
```

Ngày chỉ minh họa format, không xác nhận phòng trống.

### `GET /api/bookings`

- **200:** `{success:true,data:[{id,booking_code,user_id,hotel_id,voucher_id,check_in,check_out,adults,children,subtotal,discount_amount,total_amount,status,created_at}]}`, của user đang đăng nhập, mới nhất trước.
- **401**, **500**.

### `GET /api/bookings/{id}`

- **200:** Booking thuộc user (gồm `qr_token`, `checked_in_at`) cộng `rooms:[{room_id,price_per_night,number_of_nights,subtotal,room_number,room_type_id}]`.
- **401**, **404** nếu không thuộc user/không tồn tại, **500**.

### `PATCH /api/bookings/{id}/cancel`

- Không body. **200:** `{success:true,data:{id,status:"cancelled"}}`.
- Chỉ status pending hoặc confirmed được hủy. **401**, **404**, **409** không đủ điều kiện, **500**.

### `GET /api/bookings/{id}/qr`

- **200:** `{success:true,data:{booking_id,booking_code,status,qr_token}}`; **401**, **404**, **500**. Backend trả data để client encode QR, không thấy route tạo ảnh QR.

### `POST /api/bookings/{id}/check-in`

- Không body. **200:** `{success:true,data:{id,status:"checked_in",checked_in_at}}`.
- Chỉ booking confirmed, thuộc user và check_in bằng CURRENT_DATE. **401**, **404**, **409** nếu tồn tại nhưng chưa đủ điều kiện, **500**.

## 8. Guests

### `GET /api/bookings/{id}/guests`

- Booking phải thuộc user. **200:** `{success:true,data:[{id,booking_id,full_name,phone,email,identification_info}]}`; **401**, **404**, **500**.

### `POST /api/bookings/{id}/guests`

- Body: `full_name` bắt buộc/truthy; `phone`, `email`, `identification_info` tùy chọn.
- **201:** `{success:true,data:{id,booking_id,full_name,phone,email,identification_info}}`; **400**, **401**, **404**, **500**.

### `PUT /api/guests/{id}`

- Body tùy chọn: `full_name`, `phone`, `email`, `identification_info`; null/undefined giữ nguyên do COALESCE.
- **200:** `{success:true,message,data}`. Code dùng `RETURNING *`; cột phụ thuộc DB ngoài các field trên **NOT VERIFIED**. **401**, **404**, **500**.

### `DELETE /api/guests/{id}`

- **200:** `{success:true,message}`; chỉ xóa guest thuộc booking của user. **401**, **404**, **500**.

## 9. Payments

### `POST /api/payments`

- Auth bắt buộc. Body: `booking_id`, `payment_method` thuộc `cash|bank_transfer|online`, `amount` hữu hạn > 0.
- Booking phải thuộc user, amount bằng total_amount; canceled/completed/no_show không được thanh toán.
- **201:** `{success:true,data:{id,booking_id,payment_method,transaction_id,amount,status:"pending",paid_at:null},message}`.
- **400**, **401**, **404**, **409**, **500**.
- Payment provider, thu tiền, callback/webhook, đổi sang paid và refund: **NOT IMPLEMENTED/NOT VERIFIED** trong routes. `201` không có nghĩa payment thành công.

### `GET /api/payments/{id}`

- **200:** `{success:true,data:{id,booking_id,payment_method,transaction_id,amount,status,paid_at}}`, chỉ payment thuộc booking user. **401**, **404**, **500**.

### `GET /api/bookings/{id}/payments`

- **200:** `{success:true,data:[{id,booking_id,payment_method,transaction_id,amount,status,paid_at}]}`. **401**, **404**, **500**.

## 10. Vouchers

### `GET /api/vouchers`

- Public. **200:** danh sách `{id,code,discount_type,discount_value,min_order,start_date,end_date,status}`, chỉ active và trong thời hạn. **500**.

### `GET /api/vouchers/{code}`

- **200:** `{success:true,data:{id,code,discount_type,discount_value,min_order,start_date,end_date,status}}`; không phân biệt hoa thường, có thể trả inactive. **404**, **500**.

### `POST /api/vouchers/validate`

- Body: `code` truthy, `subtotal` số hữu hạn >= 0.
- **200:** `{success:true,data:{voucher,discount_amount,total_amount}}`.
- **400:** input, trạng thái/thời hạn hoặc min_order không đạt; **404** code không có; **500**. Percent discount tính theo tỷ lệ; kiểu khác dùng số fixed; discount tối đa subtotal.

## 11. Favorites

### `GET /api/favorites`

- Auth. **200:** `{success:true,data:[{id,name,description,address,city,star_rating}]}`; **401**, **500**.

### `POST /api/favorites/{hotel_id}`

- Auth, không body. **201:** `{success:true,data:{user_id,hotel_id}}`; **401**, **404** hotel không tồn tại, **409** đã favorite, **500**.

### `DELETE /api/favorites/{hotel_id}`

- Auth. **200:** `{success:true,message}`; **401**, **404** favorite không tồn tại, **500**.

## 12. Reviews

### `GET /api/hotels/{id}/reviews`

- Optional auth; nếu gửi bearer thì phải hợp lệ. **200:** `{success:true,data:[{id,user_id,hotel_id,booking_id,rating,comment,created_at,full_name,avatar}]}` mới trước. **401** token sai, **500**.

### `POST /api/hotels/{id}/reviews`

- Auth. Body: `booking_id`, `rating` integer sau Number conversion, 1..5; `comment` tùy chọn.
- Booking phải thuộc user, đúng hotel, status completed hoặc checked_in; mỗi booking tối đa một review theo unique conflict.
- **201:** `{success:true,data:{id,user_id,hotel_id,booking_id,rating,comment,created_at}}`; **400**, **401**, **403**, **409**, **500**.

### `POST /api/reviews`

- Auth. Body: `hotel_id`, `booking_id`, `rating` (1..5); `comment` tùy chọn.
- Tạo review như route trên; **400**, **401**, **403**, **404** FK, **409**, **500**.

### `PUT /api/reviews/{id}`

- Auth. Body phải có `rating` hoặc `comment`; rating nếu gửi 1..5.
- **200:** `{success:true,data:{id,user_id,hotel_id,booking_id,rating,comment,created_at}}`; **400**, **401**, **404** review không thuộc user/không tồn tại, **500**.

### `DELETE /api/reviews/{id}`

- Auth. **200:** `{success:true,message}`; **401**, **404**, **500**.

## 13. Chức năng thiếu/chưa xác minh

| Chức năng | Trạng thái | Căn cứ |
|---|---|---|
| Hotel search/filter/pagination | NOT IMPLEMENTED | Hotel list không đọc query; không route search |
| Hotel/room images, amenities, vibes | Source; NEEDS RUNTIME TEST | GET routes có trong source |
| Availability, booking, history, check-in | Source; NEEDS RUNTIME TEST | Có handlers; chưa có DB runtime test |
| Refresh token/rotation/revocation | NOT IMPLEMENTED | Không có flow; logout không revoke JWT |
| Payment provider/webhook/confirmation/refund | NOT IMPLEMENTED trong code đã kiểm tra | Payment POST tạo pending |
| DB migrations/schema | NOT VERIFIED | Không tìm thấy SQL/migration file |
| Production endpoint availability | NEEDS RUNTIME TEST | Chưa gọi Render; không ghi dữ liệu production |

## 14. HTTP status và errors

Không có application error code riêng trong JSON được kiểm tra. Nhiều route trả `{success:false,message}`; duplicate register có thể thêm `errors`. Message tiếng Anh/Việt và schema không đồng nhất.

| HTTP | Ý nghĩa có bằng chứng |
|---|---|
| 200 | GET/PUT/PATCH/DELETE thành công tùy route, logout/profile |
| 201 | Register, booking, guest, pending payment, favorite, review |
| 400 | Validation/body/query/date sai hoặc malformed JSON |
| 401 | Auth thiếu/sai/hết hạn; login credentials sai |
| 403 | Review không có booking đủ điều kiện |
| 404 | Resource không có/không thuộc user; route lạ |
| 409 | Duplicate/conflict state, phòng inactive/overlap |
| 500 | DB/server; JWT secret thiếu cũng trả 500 ở middleware |

Route lạ trả `{success:false,message:"API endpoint not found"}`. Global error middleware trả malformed JSON: `400 {success:false,message:"Invalid JSON request body"}`; lỗi khác: `500 {success:false,message:"Internal server error"}`. Route handlers thường bắt riêng và dùng message khác.

## 15. Postman

1. Tạo collection `Hotel Booking API`.
2. Tạo collection variable `baseUrl` = `https://hotel-booking-backend-fz9h.onrender.com`.
3. Dùng URL `{{baseUrl}}/api/...` và method từ endpoint catalog.
4. JSON body: **Body > raw > JSON**, chỉ gửi field đã xác minh.
5. Lấy `token` từ login; với endpoint có auth chọn **Authorization > Bearer Token**.
6. Kiểm tra HTTP status, response body và token. Payment response 201 vẫn là `pending`.
7. Không gửi mutation lên production chỉ để thử nếu chưa có tài khoản/dữ liệu test được cấp. Chưa có bằng chứng Postman đã được sử dụng.

## 16. Bảo mật

**Đã xác minh:** password hash bcrypt cost 12; JWT dùng biến môi trường `JWT_SECRET`, expires 7d; DB config đọc tên biến `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`; `src/config/db.js` đặt `rejectUnauthorized:false`; `cors()` không chỉ định allowlist; logout không revoke token. Không có giá trị `.env` nào được đưa vào tài liệu.

**Khuyến nghị:** không hardcode/log secrets, password, token hoặc PII; không lưu password; Flutter dùng secure storage và HTTPS. Nên đánh giá xác minh certificate TLS của PostgreSQL do cấu hình hiện tại tắt kiểm tra CA. Không tự thêm refresh flow. Dùng ID như opaque string; OpenAPI format UUID chưa được xác nhận bằng schema DB. Numeric PostgreSQL serialization chưa kiểm tra runtime; model nên parse số an toàn.

## 17. OpenAPI đối chiếu và phạm vi

- 44 method/path trong OpenAPI khớp route đã kiểm tra; không thấy operation chỉ có trong OpenAPI hoặc chỉ có trong source.
- Khác biệt xác nhận: register required fields/min password/response envelope như mục 4.
- Hotel review GET optional bearer khớp implementation.
- OpenAPI nullable/UUID/numeric có phần không xác nhận được vì repo không có schema/migration SQL.
- `npm test` chạy 7 test auth với DB stub. Các nhóm khác và production chưa runtime test.
- Base URL được cung cấp, chưa kiểm tra kết nối.

## 18. Nguồn đã kiểm tra

- [openapi.yaml](openapi.yaml), [src/app.js](src/app.js), [src/middleware/auth.js](src/middleware/auth.js), [src/config/db.js](src/config/db.js)
- Routes: [auth.js](src/routes/auth.js), [users.js](src/routes/users.js), [hotels.js](src/routes/hotels.js), [roomTypes.js](src/routes/roomTypes.js), [rooms.js](src/routes/rooms.js), [bookings.js](src/routes/bookings.js), [guests.js](src/routes/guests.js), [payments.js](src/routes/payments.js), [vouchers.js](src/routes/vouchers.js), [favorites.js](src/routes/favorites.js), [reviews.js](src/routes/reviews.js)
- [test/auth.test.js](test/auth.test.js), [package.json](package.json)
# Mock Payment API (2026-10)

Thanh toán trong phần này chỉ mô phỏng. Không gửi thông tin thẻ, CVV/CVC hoặc OTP lên backend; không có kết nối ngân hàng. `POST /api/payments` chỉ cần `booking_id` và `payment_method`. Backend tự đọc `total_amount` từ booking.

## Cấu hình và migration

- Chạy SQL migration `migrations/001_create_notifications.sql` trên PostgreSQL trước khi deploy code.
- Thêm `PAYMENT_MODE=mock` vào Environment trên Render để bật API mô phỏng. Để tắt, xóa biến hoặc đặt giá trị khác `mock`.
- Không cần Firebase để dùng thông báo trong database. FCM chưa được cấu hình hoặc triển khai.

Tại thời điểm triển khai, schema hiện có `payments.status` giới hạn các giá trị `pending`, `paid`, `failed`, `refunded`; code dùng đúng `paid`. `bookings` có `id` varchar, `user_id` uuid, `total_amount` numeric và status `pending/confirmed/...`. Không thêm cột vào hai bảng này. Schema chưa có bảng notifications nên migration chỉ tạo bảng đó.

## Tạo payment

`POST /api/payments` (Bearer JWT):

```json
{"booking_id":"BKG123","payment_method":"card"}
```

`payment_method` nhận `card` hoặc `qr`. Amount do server lấy từ `bookings.total_amount`; amount gửi từ client không được sử dụng. Response `201`:

```json
{"success":true,"data":{"id":"PAY...","booking_id":"BKG123","payment_method":"card","transaction_id":"TXN...","amount":"2500000.00","status":"pending","paid_at":null}}
```

## Lấy nội dung QR

`GET /api/payments/{payment_id}/qr` chỉ áp dụng cho payment `qr` thuộc user đăng nhập:

```json
{"success":true,"data":{"payment_id":"PAY...","booking_id":"BKG123","booking_code":"HB...","amount":"2500000.00","payment_status":"pending","qr_content":"THANH TOAN BOOKING BKG123"}}
```

Flutter có thể tạo QR từ `qr_content`. Chuỗi này không phải thông tin chuyển khoản thật; quét QR không cập nhật trạng thái thanh toán.

## Mô phỏng kết quả

`POST /api/payments/{payment_id}/simulate` (Bearer JWT, chỉ bật khi `PAYMENT_MODE=mock`):

```json
{"result":"success"}
```

Đổi `success` thành `failed` để thử thất bại. Thành công cập nhật payment thành `paid`, booking `pending` thành `confirmed`, đồng thời tạo notification trong cùng PostgreSQL transaction. Gọi lại payment đã kết thúc trả `409`; mô phỏng bị tắt trả `403`.

## Booking history và notifications

`GET /api/bookings` trả các booking thuộc JWT user, gồm `hotel_name`, danh sách `rooms`, ngày nhận/trả phòng, tổng tiền, trạng thái booking, `payment_status` và `payment_method` gần nhất. Các trường guest dùng `number_of_guests` theo schema.

`GET /api/notifications` trả thông báo trong database của user hiện tại. Tất cả endpoint trên cần Bearer JWT.

## Postman smoke flow

1. Đăng nhập, copy JWT và đặt Bearer Token cho các request.
2. Tạo booking đang `pending`, rồi gọi `POST /api/payments` với `card` và thử lại với `qr` trên booking khác.
3. Với payment QR, gọi `GET /api/payments/{id}/qr`; xác nhận `qr_content` có đúng booking ID.
4. Gọi simulate với `{"result":"failed"}` cho payment thứ nhất; xác nhận trạng thái `failed` và booking vẫn `pending`.
5. Với payment thứ hai, gọi simulate `success`; xác nhận payment `paid`, booking `confirmed`, và notification xuất hiện trong `GET /api/notifications`.
6. Gọi simulate lần nữa trên payment đã hoàn tất; mong đợi `409`. Thử ID payment/booking của user khác; mong đợi `404`.
7. Bỏ `PAYMENT_MODE=mock` trong môi trường test; simulate phải trả `403`.

