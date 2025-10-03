// server/src/routes/hostBookings.ts
import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import requireAuth from "../middleware/requireAuth";

const router = Router();

// Cache resolved column names once per process
let cachedCols:
  | { startCol: string | null; endCol: string | null }
  | null = null;

async function resolveBookingDateCols(): Promise<{
  startCol: string | null;
  endCol: string | null;
}> {
  if (cachedCols) return cachedCols;

  // Whitelists we will check for existence
  const startCandidates = [
    "start_date",
    "start_day",
    "check_in",
    "checkin",
    "start",
  ];
  const endCandidates = [
    "end_date",
    "end_day",
    "check_out",
    "checkout",
    "end",
  ];

  // Helper to pick first existing column from a candidate list
  async function firstExisting(cands: string[]): Promise<string | null> {
    const res: any = await db.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name  = 'bookings'
        AND column_name IN (${sql.join(cands.map((c) => sql`${c}`), sql`, `)})
      ORDER BY array_position(ARRAY[${sql.join(
        cands.map((c) => sql`${c}`),
        sql`, `
      )}]::text[], column_name)
      LIMIT 1
    `);
    return res?.rows?.[0]?.column_name ?? null;
  }

  const startCol = await firstExisting(startCandidates);
  const endCol = await firstExisting(endCandidates);

  cachedCols = { startCol, endCol };
  return cachedCols;
}

/**
 * GET /api/host/bookings?tab=upcoming|past|all&q=search
 * Returns bookings where the listing belongs to the current host.
 */
router.get("/bookings", requireAuth("host"), async (req: any, res) => {
  try {
    const tab = String(req.query.tab || "upcoming");
    const q = String(req.query.q || "").trim();

    const { startCol, endCol } = await resolveBookingDateCols();

    // Base WHERE: host owns the listing
    let where = sql`l.host_id = ${req.user.id}`;

    // Optional date-based filters if columns exist
    if (startCol && endCol) {
      const bStart = sql.raw(`b."${startCol}"`);
      const bEnd = sql.raw(`b."${endCol}"`);

      if (tab === "upcoming") {
        where = sql`${where} AND ${bStart} >= CURRENT_DATE`;
      } else if (tab === "past") {
        where = sql`${where} AND ${bEnd} < CURRENT_DATE`;
      }
      // "all" => no extra date where
    }

    // Text search
    if (q) {
      const like = `%${q}%`;
      // guest_email may or may not exist — coalesce safely
      where = sql`${where} AND (
        CAST(b.id AS TEXT) ILIKE ${like}
        OR l.title ILIKE ${like}
        OR COALESCE(b.guest_email,'') ILIKE ${like}
      )`;
    }

    // Build SELECT list with safe aliases
    const selectDates =
      startCol && endCol
        ? sql`${sql.raw(`b."${startCol}"`)} AS "startDate", ${sql.raw(
            `b."${endCol}"`
          )} AS "endDate",`
        : sql`NULL::date AS "startDate", NULL::date AS "endDate",`;

    // Order: prefer start date if present, else created_at if present, else id
    const orderBy =
      startCol
        ? sql.raw(`b."${startCol}" DESC, b.id DESC`)
        : sql.raw(`b.id DESC`);

    const r: any = await db.execute(sql`
      SELECT
        b.id,
        b.status,
        ${selectDates}
        b.guests,
        b.amount_cents AS "amountCents",
        b.currency,
        l.id    AS "listingId",
        l.title AS "listingTitle",
        COALESCE((
          SELECT p.url FROM photos p
          WHERE p.listing_id = l.id
          ORDER BY p.id DESC
          LIMIT 1
        ), '') AS "coverUrl"
      FROM bookings b
      JOIN listings l ON l.id = b.listing_id
      WHERE ${where}
      ORDER BY ${orderBy}
      LIMIT 200
    `);

    res.json(r.rows ?? []);
  } catch (e: any) {
    console.error("[host/bookings] error", e);
    res.status(500).json({ error: "Failed to load host bookings" });
  }
});

export default router;
