-- Speeds up ORDER BY and range filters on price
CREATE INDEX IF NOT EXISTS idx_listings_price_per_night
  ON listings (price_per_night);
