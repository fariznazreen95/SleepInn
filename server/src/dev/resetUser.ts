// ANCHOR: RESET-USER
import { db } from "../db";
import { sql } from "drizzle-orm";
import { hashPassword } from "../auth/crypto";

async function main() {
  const email = "kingdev@test.com";
  const name = "Rayn";
  const role = "host";
  const password = "kingdev_13";

  // Ensure columns exist (safe if already there)
  await db.execute(sql`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS password_hash TEXT,
      ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
  `);

  const password_hash = await hashPassword(password);

  // Upsert the user and set role + hash
  const { rows } = await db.execute(sql`
    INSERT INTO users (email, name, role, password_hash)
    VALUES (${email}, ${name}, ${role}, ${password_hash})
    ON CONFLICT (email) DO UPDATE
      SET name = EXCLUDED.name,
          role = EXCLUDED.role,
          password_hash = EXCLUDED.password_hash
    RETURNING id, email, role;
  `);

  console.log("✅ User ready:", rows[0]);
  console.log("Login with:", email, "/", password);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
