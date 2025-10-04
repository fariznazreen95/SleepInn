// server/src/routes/bookings.ts
import { Router } from "express";
import type { Response } from "express";
import { z } from "zod";
import requireAuth from "../middleware/requireAuth";
import { db } from "../db";
import { sql } from "drizzle-orm";
import Stripe from "stripe";

//////////////////////////////////////

// ====== booking date resolver (shared logic) ======
let cachedColsMine: { startCol: string | null; endCol: string | null } | null = null;

async function resolveBookingDateColsMine(): Promise<{ startCol: string | null; endCol: string | null }> {
  if (cachedColsMine) return cachedColsMine;

  const startCands = ["start_date","start_day","check_in","checkin","start"];
  const endCands   = ["end_date","end_day","check_out","checkout","end"];

  async function firstExisting(cands: string[]): Promise<string | null> {
    const res: any = await db.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name  = 'bookings'
        AND column_name IN (${sql.join(cands.map(c => sql`${c}`), sql`, `)})
      ORDER BY array_position(ARRAY[${sql.join(cands.map(c => sql`${c}`), sql`, `)}]::text[], column_name)
      LIMIT 1
    `);
    return res?.rows?.[0]?.column_name ?? null;
  }

  cachedColsMine = { startCol: await firstExisting(startCands), endCol: await firstExisting(endCands) };
  return cachedColsMine;
}


/////////////////////////////////////

const router = Router();

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || "";
const stripe = STRIPE_SECRET ? new Stripe(STRIPE_SECRET, { apiVersion: "2024-06-20" }) : null;

// Hold window (minutes) — supports either env name
const HOLD_MINUTES = Math.max(
  1,
  Number(process.env.HOLD_MINUTES ?? process.env.BOOKING_HOLD_MINUTES ?? 15)
);

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const CreateBody = z.object({
  listingId: z.coerce.number().int().positive(),
  start: DateStr,
  end: DateStr,
  guests: z.coerce.number().int().min(1).default(1),
});

type D = {
  userCol: string; listingCol: string; startCol: string; endCol: string;
  statusCol: string; amountCol: string; usesCents: boolean;
  currencyCol?: string | null; expiresCol?: string | null; guestsCol?: string | null;
};

async function cols(): Promise<string[]> {
  const r: any = await db.execute(sql`
    SELECT column_name FROM information_schema.columns WHERE table_name='bookings'
  `);
  return (r.rows || []).map((x: any) => x.column_name as string);
}
function pick(cols: string[], pats: RegExp[], fb: string) {
  for (const p of pats) { const hit = cols.find(c => p.test(c)); if (hit) return hit; } return fb;
}
async function discover(): Promise<D> {
  const c = await cols();
  const userCol    = pick(c, [/^user_id$/i, /^guest_id$/i], "user_id");
  const listingCol = pick(c, [/^listing_id$/i], "listing_id");
  const startCol   = pick(c, [/^check_in$/i, /^start(_date)?$/i, /^from(_date)?$/i], "check_in");
  const endCol     = pick(c, [/^check_out$/i, /^end(_date)?$/i, /^to(_date)?$/i], "check_out");
  const statusCol  = pick(c, [/^status$/i, /^state$/i], "status");
  const expiresCol = c.find(x => /expires|hold|timeout/i.test(x)) || null;
  const currencyCol= c.find(x => /^currency(_code)?$/i.test(x)) || null;
  const guestsCol  = c.find(x => /^(guests|guest_count|guests_count|num_guests|people)$/i.test(x)) || null;
  let amountCol = c.find(x => /^total_cents$/i.test(x)) || "";
  let usesCents = Boolean(amountCol);
  if (!amountCol) { amountCol = c.find(x => /(amount|total|price).*cents$/i.test(x)) || ""; usesCents = Boolean(amountCol); }
  if (!amountCol) { amountCol = c.find(x => /^(total_amount|amount|total|total_price|grand_total)$/i.test(x)) || "total_amount"; usesCents = false; }
  return { userCol, listingCol, startCol, endCol, statusCol, amountCol, usesCents, currencyCol, expiresCol, guestsCol };
}
// End-exclusive overlap check:
// overlap iff NOT (existing_end <= new_start OR existing_start >= new_end)
const overlaps = (s: string, e: string, start: string, end: string) =>
  sql`NOT (b.${sql.raw(e)} <= ${start}::date OR b.${sql.raw(s)} >= ${end}::date)`;

// ---------- helpers ----------
async function tableExists(name: string): Promise<boolean> {
  const r: any = await db.execute(sql`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name=${name}
    LIMIT 1
  `);
  return Boolean(r.rows?.length);
}

async function getPaymentIntentForBooking(bookingId: number, stripeSessionId?: string | null): Promise<string | null> {
  // Try payments table first (if any)
  if (await tableExists("payments")) {
    try {
      const pr: any = await db.execute(sql`
        SELECT stripe_payment_intent FROM payments WHERE booking_id=${bookingId} LIMIT 1
      `);
      const pi = pr.rows?.[0]?.stripe_payment_intent;
      if (pi) return String(pi);
    } catch {
      // ignore payments schema mismatches
    }
  }

  // Fallback: derive from stored checkout session id
  if (stripe && stripeSessionId) {
    try {
      const sess = await stripe.checkout.sessions.retrieve(stripeSessionId, {
        expand: ["payment_intent", "payment_intent.latest_charge"],
      });
      const pi = sess.payment_intent;
      if (typeof pi === "string") return pi;
      if (pi?.id) return pi.id;
    } catch {
      // ignore; caller will handle null
    }
  }
  return null;
}

// ---------- ORDER MATTERS: put /mine BEFORE any /:id routes ----------

// My trips (normalized for UI)
router.get("/mine", requireAuth(), async (req: any, res: Response) => {
  try {
    // 1) dates (flexible names)
    const { startCol, endCol } = await resolveBookingDateColsMine();

    // 2) other columns (user / guests etc.)
    const d = await discover(); // gives userCol, guestsCol, listingCol, etc.

    const selectDates =
      startCol && endCol
        ? sql`to_char(${sql.raw(`b."${startCol}"`)}::date, 'YYYY-MM-DD') AS "start_date",
              to_char(${sql.raw(`b."${endCol}"`)}::date,  'YYYY-MM-DD') AS "end_date",`
        : sql`NULL::text AS "start_date", NULL::text AS "end_date",`;

    // guests: use discovered column if present, else constant 1
    const guestsExpr = d.guestsCol
      ? sql`COALESCE(${sql.raw(`b."${d.guestsCol}"`)}, 1)`
      : sql`1`;

    // nights (fallback 1)
    const nightsExpr =
      startCol && endCol
        ? sql`GREATEST(1, (${sql.raw(`b."${endCol}"`)}::date - ${sql.raw(`b."${startCol}"`)}::date))::int`
        : sql`1`;

    const rows: any = await db.execute(sql`
      SELECT
        b.id,
        b.listing_id,
        l.title,
        l.city,
        ${guestsExpr} AS guests,

        ${selectDates}   -- -> start_date, end_date

        -- raw statuses (debug)
        COALESCE(b.status, '')     AS booking_status,
        COALESCE(p.status, 'none') AS payment_status,

        -- unified UI status for trips
        CASE
          WHEN LOWER(COALESCE(b.status,'')) = 'canceled' THEN 'canceled'
          WHEN LOWER(COALESCE(b.status,'')) = 'expired'  THEN 'expired'
          WHEN LOWER(COALESCE(p.status,''))  = 'refunded'
            OR LOWER(COALESCE(b.status,'')) = 'refunded' THEN 'refunded'
          WHEN LOWER(COALESCE(p.status,'')) IN ('succeeded','paid')
            OR LOWER(COALESCE(b.status,'')) = 'paid'     THEN 'paid'
          ELSE 'pending'
        END AS status,

        -- amounts for fmtAnyAmount (prefer payments, fallback to nights * price)
        COALESCE(
          p.amount_cents,
          (${nightsExpr} * (l.price_per_night)::numeric * 100)::int
        ) AS amount_cents,
        COALESCE(p.currency, 'MYR') AS currency,

        -- cover image (first photo if any)
        ph.url AS cover_url

      FROM bookings b
      JOIN listings l ON l.id = b.listing_id

      -- latest payment (if any)
      LEFT JOIN LATERAL (
        SELECT pp.*
        FROM payments pp
        WHERE pp.booking_id = b.id
        ORDER BY pp.created_at DESC
        LIMIT 1
      ) p ON TRUE

      -- first photo for the listing (optional)
      LEFT JOIN LATERAL (
        SELECT url
        FROM photos
        WHERE listing_id = b.listing_id
        ORDER BY id ASC
        LIMIT 1
      ) ph ON TRUE

      WHERE b.${sql.raw(d.userCol)} = ${req.user.id}
      ORDER BY b.id DESC
    `);

    res.json(rows.rows ?? []);
  } catch (e) {
    console.error("[bookings.mine]", e);
    res.status(500).json({ error: "Failed to load trips" });
  }
});



// Host view
router.get("/host/all", requireAuth("host"), async (req: any, res: Response) => {
  try {
    const d = await discover();
    const r: any = await db.execute(sql`
      SELECT b.*, l.title
      FROM bookings b
      JOIN listings l ON l.id = b.${sql.raw(d.listingCol)}
      WHERE l.host_id = ${req.user.id}
      ORDER BY b.created_at DESC
    `);
    res.json(r.rows);
  } catch {
    res.status(500).json({ error: "Failed to load host bookings" });
  }
});

// Create booking (pending), block paid + fresh pending (HOLD_MINUTES or expires_at)
router.post("/", requireAuth(), async (req: any, res: Response) => {
  try {
    const { listingId, start, end, guests } = CreateBody.parse(req.body ?? {});
    const d = await discover();

    // --- Idempotency: if the same user already has a fresh pending
    // for SAME listing + SAME dates, return it instead of erroring ---
    const freshGuard = d.expiresCol
      ? sql`b.${sql.raw(d.expiresCol)} > NOW()`
      : sql`b.created_at > NOW() - (${HOLD_MINUTES} || ' minutes')::interval`;

    const samePending: any = await db.execute(sql`
      SELECT b.id
      FROM bookings b
      WHERE b.${sql.raw(d.userCol)} = ${req.user.id}
        AND b.${sql.raw(d.listingCol)} = ${listingId}
        AND b.${sql.raw(d.statusCol)} = 'pending'
        AND ${freshGuard}
        AND b.${sql.raw(d.startCol)} = ${start}::date
        AND b.${sql.raw(d.endCol)} = ${end}::date
      LIMIT 1
    `);
    if (samePending.rows?.length) {
      return res.status(200).json({ id: samePending.rows[0].id, reused: true });
    }

    const freshPending = d.expiresCol
      ? sql`(b.${sql.raw(d.statusCol)} = 'pending' AND b.${sql.raw(d.expiresCol)} > NOW())`
      : sql`(b.${sql.raw(d.statusCol)} = 'pending' AND b.created_at > NOW() - (${HOLD_MINUTES} || ' minutes')::interval)`;

    const conflict = await db.execute(sql`
      SELECT 1 FROM bookings b
      WHERE b.${sql.raw(d.listingCol)} = ${listingId}
        AND (b.${sql.raw(d.statusCol)} = 'paid' OR ${freshPending})
        AND ${overlaps(d.startCol, d.endCol, start, end)}
      LIMIT 1
    `);
    if ((conflict as any).rows.length) return res.status(409).json({ error: "Dates are no longer available." });

    const quote: any = await db.execute(sql`
      WITH base AS (
        SELECT price_per_night FROM listings WHERE id=${listingId}
      ),
      -- IMPORTANT: end-exclusive (checkout day is NOT charged)
      days AS (
        SELECT generate_series(
          ${start}::date,
          (${end}::date - interval '1 day'),
          '1 day'
        )::date AS "day"
      ),
      nightly AS (
        SELECT
          d."day",
          COALESCE(a.price_override::numeric, (SELECT price_per_night FROM base)) AS nightly_price,
          COALESCE(a.is_available, TRUE) AS is_available,
          COALESCE(a.guests, 99) AS guests_ok
        FROM days d
        LEFT JOIN availability a
          ON a.listing_id=${listingId} AND a."day"=d."day"
      )
      SELECT
        (SELECT COUNT(*)
           FROM nightly
          WHERE is_available IS DISTINCT FROM TRUE OR guests_ok < ${guests}
        )::int AS missing_nights,
        (SELECT COALESCE(SUM(nightly_price),0)
           FROM nightly
          WHERE is_available = TRUE AND guests_ok >= ${guests}
        )::numeric AS subtotal
    `);
    
    const row = quote.rows?.[0];
    if (!row) return res.status(500).json({ error: "Failed to quote" });
    if (Number(row.missing_nights) > 0) return res.status(409).json({ error: "Unavailable for the selected dates." });

    const subtotal = Number(row.subtotal || 0);
    const service = Math.round(subtotal * 0.08 * 100) / 100;
    const total = Math.round((subtotal + service) * 100) / 100;
    const amountVal = (d.usesCents ? Math.round(total * 100) : total);

    const cols: string[] = [d.listingCol, d.userCol, d.startCol, d.endCol, d.statusCol, d.amountCol];
    const vals = [sql`${listingId}`, sql`${req.user.id}`, sql`${start}`, sql`${end}`, sql`'pending'`, sql`${amountVal}`];
    if (d.guestsCol)   { cols.push(d.guestsCol);   vals.push(sql`${guests}`); }
    if (d.currencyCol) { cols.push(d.currencyCol); vals.push(sql`'myr'`); }
    if (d.expiresCol)  {
      cols.push(d.expiresCol);
      vals.push(sql`NOW() + (${HOLD_MINUTES} || ' minutes')::interval`);
    }

    const created: any = await db.execute(sql`
      INSERT INTO bookings (${sql.raw(cols.map(n => `"${n}"`).join(", "))})
      VALUES (${sql.join(vals, sql`, `)})
      RETURNING id
    `);
    res.status(201).json({ id: created.rows[0].id });
  } catch (e: any) {
    console.error("[bookings.create]", e?.message || e);
    res.status(500).json({ error: e?.message || "Insert failed" });
  }
});

// Cancel / refund (defensive + idempotent)
router.post("/:id/cancel", requireAuth(), async (req: any, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "Invalid booking id" });

  try {
    const d = await discover();

    // Load booking first (payments join can be flaky across schemas)
    const r1: any = await db.execute(sql`
      SELECT b.*, b.${sql.raw(d.userCol)} AS uid
      FROM bookings b
      WHERE b.id=${id}
      LIMIT 1
    `);
    const b = r1.rows?.[0];
    if (!b) return res.status(404).json({ error: "Not found" });
    if (b.uid !== req.user.id) return res.status(403).json({ error: "Forbidden" });

    // No cancel if trip started
    const now = new Date();
    const startDate = new Date(b[d.startCol]);
    if (isFinite(startDate.getTime()) && startDate <= now) {
      return res.status(409).json({ error: "Trip already started." });
    }

    const status = String(b[d.statusCol]);

    // Idempotent outs
    if (["canceled", "refunded", "expired"].includes(status)) {
      return res.json({ ok: true, status });
    }

    // Pending -> just cancel (no Stripe)
    if (status === "pending") {
      await db.execute(sql`UPDATE bookings SET ${sql.raw(d.statusCol)}='canceled' WHERE id=${id}`);
      return res.json({ ok: true, status: "canceled" });
    }

    // Paid -> refund flow
    if (status === "paid") {
      if (!stripe) {
        await db.execute(sql`UPDATE bookings SET ${sql.raw(d.statusCol)}='refunded' WHERE id=${id}`);
        // best-effort payments update
        try {
          if (await tableExists("payments")) {
            await db.execute(sql`UPDATE payments SET status='refunded' WHERE booking_id=${id}`);
          }
        } catch {}
        return res.json({ ok: true, status: "refunded", note: "Dev mode: STRIPE_SECRET_KEY missing" });
      }

      // Find a Payment Intent
      const paymentIntentId = await getPaymentIntentForBooking(id, (b as any).stripe_session_id ?? null);
      if (!paymentIntentId) {
        return res.status(409).json({ error: "No payment to refund (missing payment_intent/session)." });
      }

      // Create refund
      try {
        const refund = await stripe.refunds.create({ payment_intent: paymentIntentId, reason: "requested_by_customer" });

        await db.execute(sql`UPDATE bookings SET ${sql.raw(d.statusCol)}='refunded' WHERE id=${id}`);

        // Try to write payments row (safe if table/columns differ)
        try {
          const amtRaw = Number(b[d.amountCol] ?? 0);
          const amount = (d.usesCents ? amtRaw / 100 : amtRaw);
          const currency = (b.currency || "myr").toLowerCase();

          if (await tableExists("payments")) {
            // update-or-insert
            await db.execute(sql`
              UPDATE payments
                 SET stripe_payment_intent = ${paymentIntentId},
                     amount = ${amount},
                     currency = ${currency},
                     status = 'refunded'
               WHERE booking_id = ${id}
            `);
            const chk: any = await db.execute(sql`SELECT 1 FROM payments WHERE booking_id=${id} LIMIT 1`);
            if (!chk.rows?.length) {
              await db.execute(sql`
                INSERT INTO payments (booking_id, stripe_payment_intent, amount, currency, status)
                VALUES (${id}, ${paymentIntentId}, ${amount}, ${currency}, 'refunded')
              `);
            }
          }
        } catch {
          // swallow payments-table mismatches
        }

        return res.json({ ok: true, status: "refunded", refund_id: refund.id });
      } catch (e: any) {
        // Stripe error — surface to client
        const msg = e?.message || "Stripe refund failed";
        console.error("[bookings.cancel] stripe", msg);
        return res.status(400).json({ error: msg });
      }
    }

    return res.status(409).json({ error: "Cannot cancel in this state." });
  } catch (e: any) {
    console.error("[bookings.cancel]", e?.message || e);
    return res.status(500).json({ error: "Failed to cancel" });
  }
});

export default router;
