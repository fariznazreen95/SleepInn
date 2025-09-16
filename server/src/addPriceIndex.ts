import 'dotenv/config';
import { Pool } from 'pg';

async function main() {
  // Avoid logging full URL (contains password)
  const url = process.env.DATABASE_URL!;
  const safeHost = url.split('@')[1]?.split('/')[0] ?? '<unknown-host>';
  console.log(`🔧 connecting to ${safeHost} ...`);

  const pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });

  // Create the index if missing
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_listings_price_per_night
      ON public.listings (price_per_night);
  `);

  console.log('✅ idx_listings_price_per_night ensured');
  await pool.end();
}

main().catch((e) => {
  console.error('❌ addPriceIndex error:', e);
  process.exit(1);
});
