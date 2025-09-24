import { db } from "../db";
import { sql } from "drizzle-orm";

export type ListingCore = {
  title: string;
  city: string;
  country?: string;             // optional on create; defaults below
  pricePerNight: number;
  beds: number;
  baths: number;
  instant?: boolean;
  description: string;
};

export async function listMyListings(hostId: number) {
  const { rows } = await db.execute(sql`
    SELECT
      id,
      title,
      city,
      country,
      price_per_night,
      beds,
      baths,
      is_instant_book AS instant,
      description,
      published
    FROM listings
    WHERE host_id = ${hostId}
    ORDER BY created_at DESC
  `);
  return rows;
}

export async function createListing(hostId: number, data: ListingCore) {
  const {
    title,
    city,
    country = "Malaysia",
    pricePerNight,
    beds,
    baths,
    instant = false,
    description,
  } = data;

  const { rows } = await db.execute(sql`
    INSERT INTO listings
      (host_id, title, city, country, price_per_night, beds, baths, is_instant_book, description, published)
    VALUES
      (${hostId}, ${title}, ${city}, ${country}, ${pricePerNight}, ${beds}, ${baths}, ${instant}, ${description}, false)
    RETURNING id
  `);
  return rows[0];
}

export async function updateListing(id: number, hostId: number, data: Partial<ListingCore>) {
  // Helper: translate undefined → null so COALESCE keeps existing column value
  const v = <T,>(x: T | undefined) => (x === undefined ? null : x);

  await db.execute(sql`
    UPDATE listings SET
      title            = COALESCE(${v(data.title)}, title),
      city             = COALESCE(${v(data.city)}, city),
      country          = COALESCE(${v(data.country)}, country),
      price_per_night  = COALESCE(${v(data.pricePerNight)}, price_per_night),
      beds             = COALESCE(${v(data.beds)}, beds),
      baths            = COALESCE(${v(data.baths)}, baths),
      is_instant_book  = COALESCE(${v(data.instant)}, is_instant_book),
      description      = COALESCE(${v(data.description)}, description)
    WHERE id = ${id} AND host_id = ${hostId}
  `);

  return { ok: true };
}

export async function publishListing(id: number, hostId: number) {
  await db.execute(sql`
    UPDATE listings SET published = true
    WHERE id = ${id} AND host_id = ${hostId}
  `);
  return { ok: true };
}
