-- 0002_auth_bookings.sql
-- Adds users, bookings, availability, payments tables

CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY,
  email varchar(160) NOT NULL UNIQUE,
  password_hash varchar(120) NOT NULL,
  name varchar(120),
  role varchar(16) NOT NULL DEFAULT 'user',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bookings (
  id serial PRIMARY KEY,
  user_id integer NOT NULL,
  listing_id integer NOT NULL,
  check_in timestamp NOT NULL,
  check_out timestamp NOT NULL,
  total_cents integer NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'pending',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_listing ON bookings(listing_id);

CREATE TABLE IF NOT EXISTS availability (
  id serial PRIMARY KEY,
  listing_id integer NOT NULL,
  date varchar(10) NOT NULL,
  is_available boolean NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_availability_listing_date
  ON availability(listing_id, date);

CREATE TABLE IF NOT EXISTS payments (
  id serial PRIMARY KEY,
  booking_id integer NOT NULL,
  provider varchar(32) NOT NULL DEFAULT 'manual',
  amount_cents integer NOT NULL,
  currency varchar(8) NOT NULL DEFAULT 'MYR',
  status varchar(16) NOT NULL DEFAULT 'pending',
  ref varchar(120),
  created_at timestamp NOT NULL DEFAULT now()
);
