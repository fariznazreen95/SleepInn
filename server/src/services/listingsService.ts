import { db } from "../db";
import { sql } from "drizzle-orm";

export type ListingCore = {
  title: string;
  city: string;
  country?: string;
  pricePerNight: number;
  beds: number;
  baths: number;
  instant?: boolean;
  description: string;
};

export async function listMyListings(hostId: number) {
  const { rows } = await db.execute(sql`
    SELECT
      l.id, l.title, l.city, l.country, l.price_per_night, l.beds, l.baths,
      l.is_instant_book AS instant, l.published
    FROM listings l
    WHERE l.host_id = ${hostId}
    ORDER BY l.id DESC
  `);
  return { items: rows };
}

export async function createListing(hostId: number, data: ListingCore) {
  const country = data.country ?? "Malaysia";
  const isInstant = !!data.instant;
  const { rows } = await db.execute(sql`
    INSERT INTO listings
      (title, city, country, price_per_night, beds, baths, is_instant_book, host_id, description, published)
    VALUES
      (${data.title}, ${data.city}, ${country}, ${data.pricePerNight}, ${data.beds}, ${data.baths}, ${isInstant}, ${hostId}, ${data.description}, false)
    RETURNING id
  `);
  const id = (rows as any)[0]?.id;
  return { id };
}

export async function updateListing(id: number, hostId: number, data: Partial<ListingCore>) {
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
  // Enforce at least one photo before publishing
  const countRes = await db.execute(sql`
    SELECT COUNT(*)::int AS c FROM photos WHERE listing_id = ${id}
  `);
  const c = Number((countRes as any).rows?.[0]?.c ?? 0);
  if (c < 1) {
    const err: any = new Error("At least one photo is required before publishing.");
    err.status = 409;
    throw err;
  }

  await db.execute(sql`
    UPDATE listings SET published = true
    WHERE id = ${id} AND host_id = ${hostId}
  `);
  return { ok: true };
}
