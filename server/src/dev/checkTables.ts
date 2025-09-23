import { db, pool } from "../db";
import { sql } from "drizzle-orm";

async function main() {
  const res = await db.execute(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('users','bookings','availability','payments')
    ORDER BY table_name ASC
  `);
  console.log("Tables found:", (res as any).rows.map((r: any) => r.table_name));

  // Show a couple columns from each
  const cols = await db.execute(sql`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('users','bookings','availability','payments')
    ORDER BY table_name, ordinal_position
  `);
  for (const row of (cols as any).rows) {
    console.log(`${row.table_name}.${row.column_name}: ${row.data_type}`);
  }
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
