// server/src/routes/pricing.ts
import { Router } from "express";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { computeQuote } from "../services/quote";

const router = Router();

// strict YYYY-MM-DD
const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required");

const Body = z.object({
  listingId: z.coerce.number().int().positive(),
  start: DateStr,
  end: DateStr,
  guests: z.coerce.number().int().min(1).default(1),
});

// POST /api/pricing/quote
router.post("/pricing/quote", async (req, res) => {
  // 🔎 trap: log exactly what the server received
  console.log("[pricing.quote] body:", req.body);

  try {
    const { listingId, start, end, guests } = Body.parse(req.body);
    if (start > end) return res.status(400).json({ error: "start must be <= end" });

    const q = await computeQuote({
      listingId,
      start,
      end,
      guests,
      feeRate: 0.10, // tweak here if needed
    });

    return res.json({
      listingId,
      currency: "MYR",
      nights: q.nights,
      nightlyBase: q.nightlyBase,
      effectiveNightly: q.effectiveNightly,
      mixedPricing: q.mixedPricing,
      subtotal: q.subtotal,
      fees: { service: q.serviceFee },
      total: q.total,
      meta: { city: q.city, country: q.country, start, end, guests },
    });
  } catch (e: any) {
    if (e?.status === 409) {
      return res.status(409).json({
        error: "Unavailable for all nights",
        missingDays: e.missingDays ?? [],
      });
    }
    console.error("[pricing.quote] error", e);
    const msg = e?.issues ? "Invalid payload" : "Failed to compute quote";
    return res.status(500).json({ error: msg });
  }
});

// GET /api/pricing/quote/diag?listingId=13&start=2025-10-20&end=2025-10-21&guests=1
router.get("/pricing/quote/diag", async (req, res) => {
  try {
    const listingId = Number(req.query.listingId ?? 0);
    const start = String(req.query.start ?? "");
    const end   = String(req.query.end   ?? "");
    const guests = Number(req.query.guests ?? 1);

    const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
    if (!listingId || !isYmd(start) || !isYmd(end)) {
      return res.status(400).json({ error: "listingId/start/end required YYYY-MM-DD" });
    }

    // 1) Postgres end-exclusive nights
    const nightsPGRes: any = await db.execute(sql`
      SELECT GREATEST(0, (${end}::date - ${start}::date))::int AS nights
    `);
    const nightsPG = Number(nightsPGRes?.rows?.[0]?.nights ?? 0);

    // 2) Exact day list (end-exclusive)
    const daysRes: any = await db.execute(sql`
      SELECT to_char(d, 'YYYY-MM-DD') AS day
      FROM generate_series(${start}::date, (${end}::date - INTERVAL '1 day'), '1 day') AS d
      ORDER BY d
    `);
    const seriesDays: string[] = (daysRes?.rows ?? []).map((r: any) => String(r.day));

    // 3) Availability rows considered (end-exclusive)
    const availRes: any = await db.execute(sql`
      SELECT
        a."day"::text AS day,
        a.is_available,
        a.guests AS capacity,
        COALESCE(a.price_override::numeric, l.price_per_night::numeric) AS nightly_price
      FROM availability a
      JOIN listings l ON l.id = a.listing_id
      WHERE a.listing_id = ${listingId}
        AND a."day" >= ${start}::date
        AND a."day" <  ${end}::date
      ORDER BY a."day"
    `);
    const avail = (availRes?.rows ?? []).map((r: any) => ({
      day: String(r.day).slice(0, 10),
      is_available: r.is_available === true,
      capacity: Number(r.capacity),
      nightly_price: Number(r.nightly_price),
    }));

    // 4) Quick subtotal/missing from that data
    const byDay = new Map(avail.map((r: any) => [r.day, r]));
    const missing: string[] = [];
    let subtotalFromAvail = 0;
    for (const d of seriesDays) {
      const row = byDay.get(d);
      if (!row || !row.is_available || !(row.capacity >= guests)) {
        missing.push(d);
      } else {
        subtotalFromAvail += row.nightly_price;
      }
    }

    return res.json({
      received: { listingId, start, end, guests },
      nightsPG,
      seriesDays,
      avail,
      subtotalFromAvail,
      missing,
    });
  } catch (e: any) {
    console.error("[pricing.quote.diag] error", e);
    res.status(500).json({ error: "diag failed" });
  }
});

export default router;
