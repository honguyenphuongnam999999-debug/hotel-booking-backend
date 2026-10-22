# Prompt: Integrate the existing Hotel Booking API into this Flutter project

Copy the prompt below into an AI coding assistant while the Flutter repository is open.

---

## Role and scope

You are a senior Flutter engineer integrating the existing hotel-booking backend. Work only in the Flutter project. Do not modify backend source, database schema, SMTP/Render configuration, or backend documentation unless separately authorized. Do not deploy or call production mutation endpoints as tests.

Production base URL supplied by the project: `https://hotel-booking-backend-fz9h.onrender.com`. Treat this as configuration, not proof of availability.

## Required discovery before editing

1. Read `pubspec.yaml`, inspect `lib/`, navigation, state management, theme, models, repositories/services, and tests.
2. Read `FLUTTER_AI_INTEGRATION_GUIDE.md` and `HOTEL_BOOKING_API_DOCUMENT.md`. If unavailable, inspect `src/app.js`, mounted routes, middleware and services; never infer an endpoint from a screen.
3. Reuse the existing API client/auth/token storage and summarize the plan before broad changes.

## Backend contract

Use only APIs currently present in source:

- Health: `GET /`, `GET /api/test-db` public.
- Auth: public `POST /api/auth/register` (`full_name,email,phone,password`) and `POST /api/auth/login` (`email,password`); JWT `POST /api/auth/logout`, `GET /api/auth/me`. JWT has `id`, expires in 7 days. Logout does not revoke it; delete local token.
- Profile: JWT `GET /api/users/me`, `PUT /api/users/me` accepts only `full_name`, `phone`, `avatar`.
- Catalog: public hotels (`GET /api/hotels`, `/{id}`, `/{id}/images`, `/{id}/amenities`, `/{id}/vibes`, `/{id}/room-types`), room types (`GET /api/room-types/{id}`, `/{id}/images`, `/{id}/rooms`), rooms (`GET /api/rooms`, `/{id}`, `/available`), vouchers (`GET /api/vouchers`, `/{code}`, `POST /validate`). Hotel reviews list is optional JWT; supplied invalid JWT still returns 401.
- Booking: JWT `POST /api/bookings` requires `hotel_id,room_ids,check_in,check_out,adults,booking_email`; optional `children` defaults to 0 and `voucher_code`. `room_ids` are physical room IDs. Email is per booking, checked for format/domain DNS but DNS does not verify mailbox existence. Backend calculates totals; tax is currently zero. History/detail and cancel/check-in/booking QR routes are `/api/bookings`, `/{id}`, `/{id}/cancel` (PATCH), `/{id}/check-in` (POST), `/{id}/qr`; nested guest routes are `/{id}/guests` (GET/POST) and payments `/{id}/payments` (GET). Guest edit/delete: `/api/guests/{id}` (PUT/DELETE). All these require JWT and enforce ownership where source checks it.
- Payment: JWT `POST /api/payments` takes `booking_id,payment_method` (`card` or `qr`); amount comes from DB. `GET /api/payments/{id}` and `/{id}/qr`; QR data is demo text, not proof of transfer. `POST /api/payments/{id}/simulate` takes `{"result":"success"|"failed"}` and requires server `PAYMENT_MODE=mock`.
- `POST /api/payments` returns 409 if the booking is already paid or already has a pending payment. On mock success, backend commits payment `paid` and booking `confirmed` first; it then attempts notification and email independently. Notification failure does not roll back payment or prevent email. Email uses booking `booking_email`; response includes `email.status` (`sent`, `failed`, `not_sent`). SMTP failure does not roll back paid status. A completed payment cannot be simulated/sent again. This is not a real payment-provider integration.
- Notifications: JWT `GET /api/notifications`.
- Favorites: JWT `GET /api/favorites`, `POST /api/favorites/{hotel_id}`, and `DELETE /api/favorites/{hotel_id}`.
- Reviews: JWT `POST /api/reviews` (`hotel_id,booking_id,rating,comment?`), `PUT/DELETE /api/reviews/{id}`; also hotel-scoped `POST /api/hotels/{id}/reviews`. Review requires the user's same-hotel booking in `completed` or `checked_in` state; rating 1–5. Reviews are hotel ratings, not free-form experience posts.
- There are no posts, user search, public-other-user profile, image upload, refresh-token, hotel search/pagination, or FCM endpoints in mounted source.

## Known integration caveats

- Previously inspected local schema lacked `users.id` default while register source omits an ID; login writes `last_login_at`, absent from that local metadata. Do not assume those auth writes work until verified in the target environment.
- Booking source writes `bookings.booking_email`; migration `migrations/002_add_booking_email.sql` adds it. Previously inspected local metadata did not have the column.
- Payment success inserts `notifications.content` after commit; if the table is absent, payment remains paid and email is still attempted, while notification creation is logged as failed. `GET /api/notifications` selects `content AS message` to preserve its response shape. Previously inspected local DB had no notifications table.
- Schema observations were from configured local DB, not production. Production URL, SMTP credentials/configuration, and end-to-end payment/email have not been verified. The Flutter app must never receive SMTP credentials.

## Implementation requirements

- Follow existing Flutter architecture and keep visual design/navigation unless asked otherwise.
- Keep base URL environment-configurable. Store JWT securely; never log passwords, tokens, identity details or card data.
- Attach Bearer JWT only to protected APIs. Parse nullable values, string-or-number PostgreSQL numerics, opaque string IDs and `YYYY-MM-DD` dates safely.
- Handle loading, empty, success and recoverable error states. Respect server `400/401/403/404/409/500` and booking DNS `503`; never claim success before a successful response.
- Do not invent backend fields or endpoints, fake production data, card entry, payment scanning confirmation, booking expiry, cancellation policy, refresh-token or push behavior.
- Do not modify booking/review behavior or introduce experience posts/image uploads as part of this integration.
- Add focused tests following existing Flutter conventions; do not rewrite unrelated app areas.

## Suggested flow

1. Explore hotel/catalog data and query physical room availability for dates.
2. Create booking with the selected room IDs and a separately entered `booking_email`; use the server response as canonical.
3. Create a demo payment without card data. For QR, encode/display returned demo text only. Simulate only in a demo environment when mock mode is intentionally enabled.
4. Treat payment as paid only when the server response says `data.status="paid"`. Show email status from `email.status`; do not claim an email was delivered when status is `failed` or `not_sent`.
5. Load booking history/detail and nested guests/payments as needed. For check-in, trust backend eligibility and response.

## Completion report

List changed Flutter files, integrated methods/routes and auth behavior, checks/tests run, and unresolved dependencies. Do not claim production connectivity, real payment, or email delivery unless directly verified in an authorized non-mutating way.

---

## Backend references

- `FLUTTER_AI_INTEGRATION_GUIDE.md`
- `HOTEL_BOOKING_API_DOCUMENT.md`
- `openapi.yaml` (verify against mounted source; it may not cover later changes)
