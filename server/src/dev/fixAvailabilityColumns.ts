import { db } from "../db";
import { sql } from "drizzle-orm";

async function main() {
  // Add columns if they're missing (safe, idempotent)
  await db.execute(sql`ALTER TABLE availability ADD COLUMN IF NOT EXISTS "day" DATE;`);
  await db.execute(sql`ALTER TABLE availability ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT TRUE;`);
  await db.execute(sql`ALTER TABLE availability ADD COLUMN IF NOT EXISTS guests INT NOT NULL DEFAULT 1;`);
  await db.execute(sql`ALTER TABLE availability ADD COLUMN IF NOT EXISTS price_override NUMERIC(10,2);`);

  // Make sure the unique index is in place
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_avail_listing_day
    ON availability (listing_id, "day");
  `);

  console.log("✅ availability columns/index ensured");
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
