// sleepinn/server/src/services/photosService.ts
import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Adds a photo to the existing `photos` table.
 * listingId: number - the listing's primary key
 * url: string - public URL to the image
 * key: string - storage key or identifier
 * order: number - order index for display (not used for now)
 */
export async function addPhoto(
  listingId: number,
  url: string,
  key: string,
  order: number
) {
  await db.execute(sql`
    INSERT INTO photos (listing_id, url, alt)
    VALUES (${listingId}, ${url}, ${key})
  `);
  return { ok: true };
}
