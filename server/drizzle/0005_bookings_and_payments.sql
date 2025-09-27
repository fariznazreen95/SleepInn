-- Bookings
CREATE TABLE IF NOT EXISTS bookings (
  id            SERIAL PRIMARY KEY,
  listing_id    INT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  guest_id      INT NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  guests        INT  NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'pending', -- pending|paid|canceled|refunded|expired
  total_amount  NUMERIC(10,2),
  currency      TEXT NOT NULL DEFAULT 'myr',
  stripe_session_id TEXT,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bookings_listing ON bookings (listing_id);
CREATE INDEX IF NOT EXISTS idx_bookings_guest   ON bookings (guest_id);
CREATE INDEX IF NOT EXISTS idx_bookings_range   ON bookings (start_date, end_date);

-- Payments (1:1 with booking)
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  booking_id INT UNIQUE NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  stripe_payment_intent TEXT,
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'myr',
  status TEXT NOT NULL, -- succeeded|refunded|failed|dev
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
