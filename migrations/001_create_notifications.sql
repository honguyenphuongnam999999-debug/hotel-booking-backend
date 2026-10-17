-- Notifications did not exist in the configured PostgreSQL schema.
-- This table stores in-app notifications generated after confirmed mock payments.
CREATE TABLE IF NOT EXISTS notifications (
  id varchar PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id varchar REFERENCES bookings(id) ON DELETE SET NULL,
  title varchar NOT NULL,
  content text NOT NULL,
  type varchar NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT NOW(),
  is_read boolean NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS notifications_user_created_at_idx
  ON notifications(user_id, created_at DESC);
