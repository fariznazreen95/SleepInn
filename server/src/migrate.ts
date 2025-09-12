import 'dotenv/config';
import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL! });
  await client.connect();
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: './drizzle' });
  await client.end();
  console.log('✅ Migrations applied');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
