import { db } from "../db";
import { sql } from "drizzle-orm";

async function main() {
  // add columns if missing (no NOT NULL yet)
  await db.execute(sql`ALTER TABLE availability ADD COLUMN IF NOT EXISTS "day" DATE;`);
  await db.execute(sql`ALTER TABLE availability ADD COLUMN IF NOT EXISTS is_available BOOLEAN;`);
  await db.execute(sql`ALTER TABLE availability ADD COLUMN IF NOT EXISTS guests INT;`);
  await db.execute(sql`ALTER TABLE availability ADD COLUMN IF NOT EXISTS price_override NUMERIC(10,2);`);

  // migrate legacy text/varchar "date" -> DATE "day", then drop "date"
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'availability' AND column_name = 'date'
      ) THEN
        UPDATE availability
        SET "day" = COALESCE("day", to_date("date", 'YYYY-MM-DD'))
        WHERE "day" IS NULL;

        ALTER TABLE availability DROP COLUMN IF EXISTS "date";
      END IF;
    END $$;
  `);

  // backfill defaults then enforce constraints/defaults
  await db.execute(sql`UPDATE availability SET is_available = COALESCE(is_available, TRUE) WHERE is_available IS NULL;`);
  await db.execute(sql`UPDATE availability SET guests = COALESCE(guests, 1) WHERE guests IS NULL;`);

  await db.execute(sql`ALTER TABLE availability ALTER COLUMN "day" SET NOT NULL;`);
  await db.execute(sql`ALTER TABLE availability ALTER COLUMN is_available SET NOT NULL;`);
  await db.execute(sql`ALTER TABLE availability ALTER COLUMN guests SET NOT NULL;`);
  await db.execute(sql`ALTER TABLE availability ALTER COLUMN is_available SET DEFAULT TRUE;`);
  await db.execute(sql`ALTER TABLE availability ALTER COLUMN guests SET DEFAULT 1;`);

  // unique index for upsert
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_avail_listing_day
    ON availability (listing_id, "day");
  `);

  console.log("✅ availability schema normalized");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
