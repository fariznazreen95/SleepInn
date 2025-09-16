import 'dotenv/config';
import { Pool } from 'pg';

async function main() {
  console.log('🔎 verifying indexes for public.listings ...');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL!,
    ssl: { rejectUnauthorized: false },
  });

  const { rows } = await pool.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname='public' AND tablename='listings';
  `);

  console.log(`✅ query ok. found ${rows.length} row(s).`);
  console.table(rows);

  await pool.end();
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ verifyIndexes error:', e);
  process.exit(1);
});
