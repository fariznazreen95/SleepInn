import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { z } from "zod";

const router = Router();

// strict YYYY-MM-DD
const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required");

const Body = z.object({
  listingId: z.coerce.number().int().positive(),
  start: DateStr,
  end: DateStr,
  guests: z.coerce.number().int().min(1).default(1),
});

// UTC-safe inclusive nights
function nightsInclusive(start: string, end: string): number {
  const s = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  if (!Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime())) return 0;
  return Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
}

router.post("/pricing/quote", async (req, res) => {
  try {
    const { listingId, start, end, guests } = Body.parse(req.body);
    if (start > end) return res.status(400).json({ error: "start must be <= end" });

    const nights = nightsInclusive(start, end);
    if (nights <= 0) return res.status(400).json({ error: "Invalid date range" });

    // Base price from listings (published only)
    const baseRes = await db.execute(sql`
      SELECT (price_per_night)::numeric AS base_price, city, country
      FROM listings
      WHERE id = ${listingId} AND published = true
      LIMIT 1
    `);
    const baseRow = (baseRes as any).rows?.[0];
    if (!baseRow) return res.status(404).json({ error: "Listing not found" });

    const basePrice = Number(baseRow.base_price);

    // Build nightly rows for range; require every day to be present & OK
    const quoteRes = await db.execute(sql`
      WITH days AS (
        SELECT generate_series(${start}::date, ${end}::date, '1 day')::date AS "day"
      ),
      nightly AS (
        SELECT
          d."day",
          COALESCE(a.price_override::numeric, ${basePrice}) AS nightly_price,
          a.is_available,
          a.guests
        FROM days d
        LEFT JOIN availability a
          ON a.listing_id = ${listingId}
         AND a."day" = d."day"
      ),
      missing AS (
        SELECT "day"
        FROM nightly
        WHERE is_available IS DISTINCT FROM TRUE  -- NULL or FALSE -> missing
           OR guests IS NULL
           OR guests < ${guests}
      )
      SELECT
        (SELECT COUNT(*) FROM days)::int AS nights_expected,
        (SELECT COUNT(*) FROM nightly WHERE is_available = TRUE AND guests >= ${guests})::int AS nights_ok,
        (SELECT COALESCE(SUM(nightly_price), 0) FROM nightly WHERE is_available = TRUE AND guests >= ${guests})::numeric AS subtotal,
        (SELECT COALESCE(json_agg("day"::text), '[]'::json) FROM missing) AS missing_days
    `);

    const q = (quoteRes as any).rows?.[0];
    const nightsExpected: number = q?.nights_expected ?? 0;
    const nightsOk: number = q?.nights_ok ?? 0;
    const missingDays: string[] = q?.missing_days ?? [];

    if (nightsOk !== nightsExpected) {
      return res.status(409).json({
        error: "Unavailable for all nights",
        missingDays,
      });
    }

    const subtotal = Number(q.subtotal);
    const serviceFee = Math.round(subtotal * 0.10 * 100) / 100; // 10% placeholder
    const total = Math.round((subtotal + serviceFee) * 100) / 100;

    return res.json({
      listingId,
      currency: "MYR",
      nights,
      nightlyBase: basePrice,
      subtotal,
      fees: { service: serviceFee },
      total,
      meta: { city: baseRow.city, country: baseRow.country, start, end, guests },
    });
  } catch (e: any) {
    console.error("[pricing.quote] error", e);
    const msg = e?.issues ? "Invalid payload" : "Failed to compute quote";
    return res.status(500).json({ error: msg });
  }
});

export default router;
