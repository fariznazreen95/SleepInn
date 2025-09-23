-- Ensure published flag exists on listings (your IDs are integers; do not add UUID cols)
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS published BOOLEAN DEFAULT FALSE;

-- Helpful index for public queries
CREATE INDEX IF NOT EXISTS idx_listings_published
  ON listings (published);
