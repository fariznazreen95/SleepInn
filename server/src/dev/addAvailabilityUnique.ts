import { db } from "../db";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_avail_listing_day
    ON availability (listing_id, "day");
  `);
  console.log("✅ unique index ensured (listing_id, day)");
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
