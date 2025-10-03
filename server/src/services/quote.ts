import { db } from "../db";
import { sql } from "drizzle-orm";

export type QuoteResult = {
  nights: number;
  nightlyBase: number;
  subtotal: number;
  serviceFee: number;
  total: number;
  missingDays: string[];
  city: string;
  country: string;
  start: string;
  end: string;
  guests: number;
  effectiveNightly: number;  // subtotal / nights
  mixedPricing: boolean;     // true if nightly overrides vary across range
};

// keep for other callers, but we won't rely on JS date math anymore
export function nightsExclusive(start: string, end: string): number {
  const s = new Date(start + "T00:00:00Z").getTime();
  const e = new Date(end   + "T00:00:00Z").getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 0;
  return Math.max(0, Math.floor((e - s) / 86400000));
}

export async function computeQuote(opts: {
  listingId: number;
  start: string;
  end: string;
  guests: number;
  feeRate?: number; // default 0.10 (10%)
}): Promise<QuoteResult> {
  const { listingId, start, end, guests, feeRate = 0.10 } = opts;

  // 1) Listing core (base price + location)
  const baseRes: any = await db.execute(sql`
    SELECT (price_per_night)::numeric AS base_price, city, country
    FROM listings
    WHERE id = ${listingId} AND published = true
    LIMIT 1
  `);
  const baseRow = baseRes?.rows?.[0];
  if (!baseRow) throw new Error("Listing not found");
  const basePrice = Number(baseRow.base_price);

  // 2) Nights from Postgres (END-EXCLUSIVE) — source of truth
  //    (end::date - start::date) already yields the exclusive count.
  const nightsRes: any = await db.execute(sql`
    SELECT GREATEST(0, (${end}::date - ${start}::date))::int AS nights
  `);
  const nights: number = Number(nightsRes?.rows?.[0]?.nights ?? 0);
  if (nights <= 0) {
    const err: any = new Error("Unavailable for all nights");
    err.status = 409;
    err.missingDays = [];
    throw err;
  }

  // 3) Build the exact date list in SQL (END-EXCLUSIVE)
  const needDaysRes: any = await db.execute(sql`
    SELECT to_char(d, 'YYYY-MM-DD') AS day
    FROM generate_series(${start}::date, (${end}::date - INTERVAL '1 day'), '1 day') AS d
    ORDER BY d
  `);
  const needDays: string[] = (needDaysRes?.rows ?? []).map((r: any) => String(r.day));

  // 4) Pull availability rows for [start, end) and compute in SQL
  const rowsRes: any = await db.execute(sql`
    SELECT
      a."day"::text                       AS day,
      a.is_available                      AS is_available,
      a.guests                            AS capacity,
      COALESCE(a.price_override::numeric, ${basePrice}) AS nightly_price
    FROM availability a
    WHERE a.listing_id = ${listingId}
      AND a."day" >= ${start}::date
      AND a."day" <  ${end}::date     -- END-EXCLUSIVE
    ORDER BY a."day"
  `);
  const rows = rowsRes?.rows ?? [];

  // 5) Index availability rows by YYYY-MM-DD
  const byDay = new Map<string, { ok: boolean; price: number }>();
  for (const r of rows) {
    const day = String(r.day).slice(0, 10);
    const ok =
      r.is_available === true &&
      Number.isFinite(+r.capacity) &&
      Number(r.capacity) >= guests;
    const price = Number(r.nightly_price);
    byDay.set(day, { ok, price });
  }

  // 6) Evaluate missing + subtotal
  const missingDays: string[] = [];
  let subtotal = 0;
  let minP = Number.POSITIVE_INFINITY;
  let maxP = Number.NEGATIVE_INFINITY;

  for (const d of needDays) {
    const entry = byDay.get(d);
    if (!entry || !entry.ok) {
      missingDays.push(d);
    } else {
      subtotal += entry.price;
      if (entry.price < minP) minP = entry.price;
      if (entry.price > maxP) maxP = entry.price;
    }
  }

  if (missingDays.length > 0) {
    const err: any = new Error("Unavailable for all nights");
    err.status = 409;
    err.missingDays = missingDays;
    throw err;
  }

  // 7) Totals
  const serviceFee = Math.round(subtotal * feeRate * 100) / 100; // 2 dp
  const total = Math.round((subtotal + serviceFee) * 100) / 100;
  if (!Number.isFinite(minP)) { minP = basePrice; maxP = basePrice; }
  const mixedPricing = minP !== maxP;
  const effectiveNightly = nights > 0 ? Math.round((subtotal / nights) * 100) / 100 : 0;

  return {
    nights,
    nightlyBase: basePrice,
    subtotal,
    serviceFee,
    total,
    missingDays,
    city: String(baseRow.city),
    country: String(baseRow.country),
    start, end, guests,
    effectiveNightly,
    mixedPricing,
  };
}

export function toCents(myr: number) {
  return Math.round(myr * 100);
}
