// server/src/routes/hostBookings.ts
import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import requireAuth from "../middleware/requireAuth";

const router = Router();

/* ────────────────────────────────────────────────────────────────────────── */
/* Column resolution (cached)                                                */
/* ────────────────────────────────────────────────────────────────────────── */

let cachedCols: { startCol: string | null; endCol: string | null } | null = null;

async function resolveBookingDateCols(): Promise<{ startCol: string | null; endCol: string | null }> {
  if (cachedCols) return cachedCols;

  const startCandidates = ["start_date", "start_day", "check_in", "checkin", "start"];
  const endCandidates   = ["end_date", "end_day", "check_out", "checkout", "end"];

  async function firstExisting(cands: string[]): Promise<string | null> {
    const res: any = await db.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name  = 'bookings'
        AND column_name IN (${sql.join(cands.map((c) => sql`${c}`), sql`, `)})
      ORDER BY array_position(
        ARRAY[${sql.join(cands.map((c) => sql`${c}`), sql`, `)}]::text[], column_name
      )
      LIMIT 1
    `);
    return res?.rows?.[0]?.column_name ?? null;
  }

  const startCol = await firstExisting(startCandidates);
  const endCol   = await firstExisting(endCandidates);

  cachedCols = { startCol, endCol };
  return cachedCols;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* GET /api/host/bookings                                                    */
/*   ?tab=upcoming|past|all  ?q=search                                       */
/*   Returns bookings where listings belong to the current host.             */
/* ────────────────────────────────────────────────────────────────────────── */

router.get("/bookings", requireAuth("host"), async (req: any, res) => {
  try {
    const tab = String(req.query.tab || "upcoming");
    const q   = String(req.query.q || "").trim();

    const { startCol, endCol } = await resolveBookingDateCols();
    const bStart = startCol ? sql.raw(`b."${startCol}"`) : null;
    const bEnd   = endCol   ? sql.raw(`b."${endCol}"`)   : null;

    // Dates → 'YYYY-MM-DD' to match UI expectation (avoid "Invalid Date")
    const selectDates =
      bStart && bEnd
        ? sql`to_char(${bStart}::date, 'YYYY-MM-DD') AS "start_date",
              to_char(${bEnd}::date,  'YYYY-MM-DD') AS "end_date",`
        : sql`NULL::text AS "start_date", NULL::text AS "end_date",`;

    // Nights (for amount fallback) — min 1
    const nights = bStart && bEnd
      ? sql`GREATEST(1, (${bEnd}::date - ${bStart}::date))::int`
      : sql`1`;

    // Base WHERE: host owns the listing
    let where = sql`l.host_id = ${req.user.id}`;

    // Optional tab filter (only if we have dates)
    if (bStart && bEnd) {
      if (tab === "upcoming") {
        where = sql`${where} AND ${bStart} >= CURRENT_DATE`;
      } else if (tab === "past") {
        where = sql`${where} AND ${bEnd} < CURRENT_DATE`;
      }
      // "all" => no extra date filter
    }

    // Optional text search (id, listing title, guest name/email)
    if (q) {
      const like = `%${q}%`;
      where = sql`${where} AND (
        CAST(b.id AS TEXT) ILIKE ${like}
        OR l.title ILIKE ${like}
        OR COALESCE(u.name,'') ILIKE ${like}
        OR COALESCE(u.email,'') ILIKE ${like}
      )`;
    }

    // Order: prefer start date if present; else id desc
    const orderBy = bStart
      ? sql.raw(`b."${startCol!}" DESC, b.id DESC`)
      : sql.raw(`b.id DESC`);

    // Case-insensitive paid/refunded detector
    const paidWhere = sql`
      (
        (p.status IS NOT NULL AND LOWER(p.status) = ANY(ARRAY['succeeded','paid','refunded']))
        OR
        (b.status IS NOT NULL AND LOWER(b.status) = ANY(ARRAY['paid','refunded']))
      )
    `;

    // Query
    const rows = await db.execute(sql`
      SELECT
        b.id,
        l.title,
        COALESCE(NULLIF(u.name,''), u.email, '') AS guest_name,

        ${selectDates}  -- -> start_date, end_date

        -- raw statuses (for debugging if needed)
        b.status AS booking_status,
        COALESCE(p.status, 'none') AS payment_status,

        -- unified UI status
        CASE
          WHEN (p.status IS NOT NULL AND LOWER(p.status) = 'refunded')
            OR (b.status IS NOT NULL AND LOWER(b.status) = 'refunded')
          THEN 'refunded'
          ELSE 'paid'
        END AS status,

        -- amount: prefer payments; fallback to nights * price_per_night
        (
          COALESCE(
            p.amount_cents,
            (${nights} * (l.price_per_night)::numeric * 100)::int
          )
        ) AS amount_cents,
        COALESCE(p.currency, 'MYR') AS currency

      FROM bookings b
      JOIN listings l ON l.id = b.listing_id
      LEFT JOIN users u ON u.id = b.user_id

      -- latest payment (if any)
      LEFT JOIN LATERAL (
        SELECT pp.*
        FROM payments pp
        WHERE pp.booking_id = b.id
        ORDER BY pp.created_at DESC
        LIMIT 1
      ) p ON TRUE

      WHERE ${where} AND ${paidWhere}
      ORDER BY ${orderBy}
    `);

    // Debug mode to inspect host data quickly
    if (String(req.query.debug || "") === "1") {
      const diag = await db.execute(sql`
        WITH host_rows AS (
          SELECT b.id, b.status, l.host_id
          FROM bookings b
          JOIN listings l ON l.id = b.listing_id
          WHERE l.host_id = ${req.user.id}
        ),
        last_pay AS (
          SELECT DISTINCT ON (pp.booking_id) pp.booking_id, pp.status
          FROM payments pp
          ORDER BY pp.booking_id, pp.created_at DESC
        )
        SELECT
          COUNT(*)                                       AS total_host_bookings,
          COUNT(*) FILTER (WHERE LOWER(b.status)='paid')      AS bookings_paid_lower,
          COUNT(*) FILTER (WHERE LOWER(b.status)='refunded')  AS bookings_refunded_lower,
          COUNT(*) FILTER (WHERE LOWER(lp.status)='succeeded') AS payments_succeeded,
          COUNT(*) FILTER (WHERE LOWER(lp.status)='paid')       AS payments_paid,
          COUNT(*) FILTER (WHERE LOWER(lp.status)='refunded')   AS payments_refunded
        FROM host_rows b
        LEFT JOIN last_pay lp ON lp.booking_id = b.id
      `);
      return res.json({ data: (rows as any).rows ?? [], debug: (diag as any).rows?.[0] ?? null });
    }

    return res.json((rows as any).rows ?? []);
  } catch (e: any) {
    console.error("[host/bookings] error", e);
    return res.status(500).json({ error: "Failed to load host bookings" });
  }
});

export default router;
