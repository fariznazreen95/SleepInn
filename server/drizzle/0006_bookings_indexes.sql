-- 0006_bookings_indexes.sql
-- Keep webhook/refund & sweeper fast, safely (works whether expires_at exists or not)

-- 1) Ensure the session column exists (older DBs might not have it yet)
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS stripe_session_id text;

-- 2) Fast lookup by Stripe session id (webhook/refund path)
CREATE INDEX IF NOT EXISTS idx_bookings_stripe_session
  ON public.bookings (stripe_session_id);

-- 3) Sweeper helper:
-- Prefer (status, expires_at) if the column exists; otherwise fall back to (status, created_at)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='bookings' AND column_name='expires_at'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE tablename='bookings' AND indexname='idx_bookings_status_expires'
    ) THEN
      EXECUTE 'CREATE INDEX idx_bookings_status_expires ON public.bookings (status, expires_at)';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE tablename='bookings' AND indexname='idx_bookings_status_created'
    ) THEN
      EXECUTE 'CREATE INDEX idx_bookings_status_created ON public.bookings (status, created_at)';
    END IF;
  END IF;
END $$;
