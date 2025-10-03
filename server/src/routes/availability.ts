import { Router } from "express";
import requireAuth from "../middleware/requireAuth";
import { requireOwner } from "../middleware/ownerGuard";
import { z } from "zod";
import { db } from "../db";
import { sql } from "drizzle-orm";

const router = Router();

// Strict YYYY-MM-DD
const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD required");

const Body = z.object({
  start: DateStr,
  end: DateStr,
  is_available: z.boolean().default(true),
  guests: z.number().int().min(1).default(1),
  price_override: z.number().positive().optional(),
});

// Helper: inclusive range of YYYY-MM-DD strings (UTC-safe)
function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) throw new Error("Bad date");
  if (s > e) return out;
  for (let d = s; d <= e; d = new Date(d.getTime() + 86400000)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * POST /api/host/listings/:id/availability/bulk
 * Build a VALUES table from JS and UPSERT. No generate_series, no casting issues.
 */
router.post(
  "/host/listings/:id/availability/bulk",
  requireAuth("host"),
  requireOwner,
  async (req: any, res) => {
    try {
      const listingId = Number(req.params.id);
      const { start, end, is_available, guests, price_override } = Body.parse(req.body);

      const days = dateRange(start, end);
      if (!days.length) return res.status(400).json({ error: "start must be <= end" });

      // Build: VALUES (listingId, day, is_available, guests, price_override), ...
      const values = sql.join(
        days.map((d) => sql`(${listingId}, ${d}, ${is_available}, ${guests}, ${price_override ?? null})`),
        sql`,`
      );

      await db.execute(sql`
        INSERT INTO availability (listing_id, "day", is_available, guests, price_override)
        VALUES ${values}
        ON CONFLICT (listing_id, "day") DO UPDATE
        SET is_available   = EXCLUDED.is_available,
            guests         = EXCLUDED.guests,
            price_override = EXCLUDED.price_override
      `);

      return res.json({ ok: true, count: days.length });
    } catch (e: any) {
      console.error("[availability.bulk] error", e);
      const msg = e?.issues ? "Invalid payload" : (e?.message || "Failed to set availability");
      return res.status(500).json({ error: msg });
    }
  }
);

/**
 * GET /api/host/listings/:id/availability  — peek first 10 rows
 */
router.get(
  "/host/listings/:id/availability",
  requireAuth("host"),
  requireOwner,
  async (req, res) => {
    try {
      const listingId = Number(req.params.id);
      const { rows } = await db.execute(sql`
        SELECT listing_id, "day", is_available, guests, price_override
        FROM availability
        WHERE listing_id = ${listingId}
        ORDER BY "day"
        LIMIT 10
      `);
      return res.json(rows);
    } catch (e) {
      console.error("[availability.peek] error", e);
      return res.status(500).json({ error: "Failed to read availability" });
    }
  }
);

// DEV-ONLY: see which dates block a listing from matching the search
// GET /api/diag/availability/:id?start=YYYY-MM-DD&end=YYYY-MM-DD&guests=3
router.get(
    "/diag/availability/:id",
    requireAuth("host"),      // it's fine for local; remove if you want
    requireOwner,
    async (req, res) => {
      try {
        const listingId = Number(req.params.id);
        const start = String(req.query.start ?? "");
        const end   = String(req.query.end ?? "");
        const guests = req.query.guests ? Number(req.query.guests) : undefined;
  
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
          return res.status(400).json({ error: "Use YYYY-MM-DD for start/end" });
        }
        if (start > end) return res.status(400).json({ error: "start must be <= end" });
  
        const capCheck = Number.isFinite(guests) ? sql` OR a.guests < ${guests!} ` : sql``;
  
        const { rows } = await db.execute(sql`
          WITH days AS (
            SELECT generate_series(${start}::date, (${end}::date - INTERVAL '1 day'), '1 day')::date AS "day"
          )
          SELECT
            d."day"::text                         AS day,
            (a."day" IS NOT NULL)                 AS has_row,
            a.is_available                        AS is_available,
            a.guests                              AS guests
          FROM days d
          LEFT JOIN availability a
            ON a.listing_id = ${listingId}
           AND a."day" = d."day"
          WHERE a."day" IS NULL
             OR a.is_available = FALSE
             ${capCheck}
          ORDER BY d."day"
        `);
  
        return res.json({ badDays: rows });
      } catch (e) {
        console.error("[diag.availability] error", e);
        return res.status(500).json({ error: "diag failed" });
      }
    }
  ); 

// DEV: show which listings pass the base filter (published/city/price/instant)
router.get("/diag/listings-base", async (req, res) => {
    try {
      const { city, min, max, instant } = req.query as any;
  
      const MIN_PRICE = 0, MAX_PRICE = 100_000;
      const minRM = Number.isFinite(+min) ? Math.max(+min, MIN_PRICE) : MIN_PRICE;
      const maxRM = Number.isFinite(+max) ? Math.min(+max, MAX_PRICE) : MAX_PRICE;
      const isInstant = instant === "true" || instant === "1";
      const cityRaw = (city ?? "").trim();
      const cityKey = cityRaw.replace(/\s+/g, "");
  
      const whereFrag = sql`
        l.published = true
        ${cityKey ? sql` AND REPLACE(l.city, ' ', '') ILIKE ${"%" + cityKey + "%"} ` : sql``}
        AND (l.price_per_night)::numeric BETWEEN ${minRM} AND ${maxRM}
        ${isInstant ? sql` AND l.is_instant_book = true ` : sql``}
      `;
  
      const { rows } = await db.execute(sql`
        SELECT l.id, l.title, l.city, l.price_per_night, l.is_instant_book
        FROM listings l
        WHERE ${whereFrag}
        ORDER BY l.id
        LIMIT 50
      `);
      res.json({ base: rows });
    } catch (e) {
      console.error("[diag.listings-base] error", e);
      res.status(500).json({ error: "diag failed" });
    }
  });
  
  // DEV: show which listings pass the NOT EXISTS date-range check
  router.get("/diag/listings-eligible", async (req, res) => {
    try {
      const { city, min, max, instant, start, end, guests } = req.query as any;
  
      const isYmd = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
      if (!isYmd(start) || !isYmd(end)) return res.status(400).json({ error: "start/end YYYY-MM-DD" });
      if (start > end) return res.status(400).json({ error: "start <= end" });
  
      const MIN_PRICE = 0, MAX_PRICE = 100_000;
      const minRM = Number.isFinite(+min) ? Math.max(+min, MIN_PRICE) : MIN_PRICE;
      const maxRM = Number.isFinite(+max) ? Math.min(+max, MAX_PRICE) : MAX_PRICE;
      const isInstant = instant === "true" || instant === "1";
      const cityRaw = (city ?? "").trim();
      const cityKey = cityRaw.replace(/\s+/g, "");
      const needGuests = Number.isFinite(+guests) ? Math.max(1, Math.trunc(+guests)) : undefined;
  
      const baseWhere = sql`
        l.published = true
        ${cityKey ? sql` AND REPLACE(l.city, ' ', '') ILIKE ${"%" + cityKey + "%"} ` : sql``}
        AND (l.price_per_night)::numeric BETWEEN ${minRM} AND ${maxRM}
        ${isInstant ? sql` AND l.is_instant_book = true ` : sql``}
      `;
  
      const capCheck = needGuests ? sql` OR a.guests < ${needGuests} ` : sql``;
  
      const { rows } = await db.execute(sql`
        WITH days AS (
          SELECT generate_series(${start}::date, (${end}::date - INTERVAL '1 day'), '1 day')::date AS "day"
        )
        SELECT l.id
        FROM listings l
        WHERE ${baseWhere}
          AND NOT EXISTS (
            SELECT 1
            FROM days d
            LEFT JOIN availability a
              ON a.listing_id = l.id
             AND a."day" = d."day"
            WHERE a."day" IS NULL
               OR a.is_available = FALSE
               ${capCheck}
          )
        ORDER BY l.id
        LIMIT 50
      `);
      res.json({ eligible: rows });
    } catch (e) {
      console.error("[diag.listings-eligible] error", e);
      res.status(500).json({ error: "diag failed" });
    }
  });
  

export default router;
