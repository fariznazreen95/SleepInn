import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import 'dotenv/config';

// Neon connection string comes from .env
const connectionString = process.env.DATABASE_URL!;
export const pool = new Pool({
  connectionString,
  // Helps on some Windows setups + Neon SSL; safe to keep
  ssl: { rejectUnauthorized: false },
  keepAlive: true,
});

// drizzle can work with a Pool (recommended here)
export const db = drizzle(pool);
