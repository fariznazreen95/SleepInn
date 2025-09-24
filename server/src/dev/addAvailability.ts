// server/src/dev/addAvailability.ts
import { db } from "../db";
import { sql } from "drizzle-orm";

async function main() {
  // 1) Ensure table exists (minus 'day' so we can ALTER safely)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS availability (
      id SERIAL PRIMARY KEY,
      listing_id INT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      is_available BOOLEAN NOT NULL DEFAULT TRUE,
      guests INT NOT NULL DEFAULT 1,
      price_override NUMERIC(10,2)
    );
  `);

  // 2) Add the 'day' column if missing (NOT NULL ok if table empty)
  await db.execute(sql`
    ALTER TABLE availability
      ADD COLUMN IF NOT EXISTS "day" DATE NOT NULL;
  `);

  // 3) Create the index (quote "day" to avoid any keyword weirdness)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_avail_listing_day
      ON availability (listing_id, "day");
  `);

  console.log("✅ availability table ready (with day + index)");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
