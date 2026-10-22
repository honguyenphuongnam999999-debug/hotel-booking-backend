-- Add a per-booking contact address without changing existing booking data.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS booking_email VARCHAR(255);
