import { db } from "../db";
import { sql } from "drizzle-orm";

export type ListingCore = {
  title: string;
  city: string;
  pricePerNight: number;
  beds: number;
  baths: number;
  instant?: boolean;
  description: string;
};

export async function listMyListings(hostId: number) {
  const { rows } = await db.execute(sql`
    SELECT id, title, city, price_per_night, beds, baths, is_instant_book as instant, description, published
    FROM listings
    WHERE host_id = ${hostId}
    ORDER BY created_at DESC
  `);
  return rows;
}

export async function createListing(hostId: number, data: ListingCore) {
  const { title, city, pricePerNight, beds, baths, instant = false, description } = data;
  const { rows } = await db.execute(sql`
    INSERT INTO listings (host_id, title, city, price_per_night, beds, baths, is_instant_book, description, published)
    VALUES (${hostId}, ${title}, ${city}, ${pricePerNight}, ${beds}, ${baths}, ${instant}, ${description}, false)
    RETURNING id
  `);
  return rows[0];
}

export async function updateListing(id: number, hostId: number, data: Partial<ListingCore>) {
  const sets: string[] = [];
  if (data.title !== undefined) sets.push(`title = ${sql.param(data.title)}`);
  if (data.city !== undefined) sets.push(`city = ${sql.param(data.city)}`);
  if (data.pricePerNight !== undefined) sets.push(`price_per_night = ${sql.param(data.pricePerNight)}`);
  if (data.beds !== undefined) sets.push(`beds = ${sql.param(data.beds)}`);
  if (data.baths !== undefined) sets.push(`baths = ${sql.param(data.baths)}`);
  if (data.instant !== undefined) sets.push(`is_instant_book = ${sql.param(data.instant)}`);
  if (data.description !== undefined) sets.push(`description = ${sql.param(data.description)}`);
  if (!sets.length) return { ok: true };

  await db.execute(sql.raw(`
    UPDATE listings SET ${sets.join(", ")}
    WHERE id = ${id} AND host_id = ${hostId}
  `));
  return { ok: true };
}

export async function publishListing(id: number, hostId: number) {
  await db.execute(sql`
    UPDATE listings SET published = true
    WHERE id = ${id} AND host_id = ${hostId}
  `);
  return { ok: true };
}
