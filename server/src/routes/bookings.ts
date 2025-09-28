// server/src/routes/bookings.ts
import { Router } from "express";
import type { Response } from "express";
import { z } from "zod";
import requireAuth from "../middleware/requireAuth";
import { db } from "../db";
import { sql } from "drizzle-orm";
import Stripe from "stripe";

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
const overlaps = (s: string, e: string, start: string, end: string) =>
  sql`NOT (b.${sql.raw(e)} < ${start}::date OR b.${sql.raw(s)} > ${end}::date)`;

// ---------- ORDER MATTERS: put /mine BEFORE any /:id routes ----------

// My trips
router.get("/mine", requireAuth(), async (req: any, res: Response) => {
  try {
    const d = await discover();
    const r: any = await db.execute(sql`
      SELECT b.*, l.title, l.city
      FROM bookings b
      JOIN listings l ON l.id = b.${sql.raw(d.listingCol)}
      WHERE b.${sql.raw(d.userCol)} = ${req.user.id}
      ORDER BY b.created_at DESC
    `);
    res.json(r.rows);
  } catch {
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
      WITH base AS (SELECT price_per_night FROM listings WHERE id=${listingId}),
      days AS (SELECT generate_series(${start}::date, ${end}::date, '1 day')::date AS "day"),
      nightly AS (
        SELECT d."day",
               COALESCE(a.price_override::numeric, (SELECT price_per_night FROM base)) AS nightly_price,
               COALESCE(a.is_available, TRUE) AS is_available,
               COALESCE(a.guests, 99) AS guests_ok
        FROM days d
        LEFT JOIN availability a ON a.listing_id=${listingId} AND a."day"=d."day"
      )
      SELECT
        (SELECT COUNT(*) FROM nightly WHERE is_available IS DISTINCT FROM TRUE OR guests_ok < ${guests})::int AS missing_nights,
        (SELECT COALESCE(SUM(nightly_price),0) FROM nightly WHERE is_available = TRUE AND guests_ok >= ${guests})::numeric AS subtotal
    `);
    const row = quote.rows?.[0];
    if (!row) return res.status(500).json({ error: "Failed to quote" });
    if (Number(row.missing_nights) > 0) return res.status(409).json({ error: "Unavailable for the selected dates." });

    const subtotal = Number(row.subtotal || 0);
    const service = Math.round(subtotal * 0.08 * 100) / 100;
    const total = Math.round((subtotal + service) * 100) / 100;
    const amountVal = (await discover()).usesCents ? Math.round(total * 100) : total;

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

// Cancel / refund (prod-ready)
router.post("/:id/cancel", requireAuth(), async (req: any, res: Response) => {
  try {
    const id = Number(req.params.id);
    const d = await discover();

    // Load booking + any recorded payment intent (if payments table exists)
    const r: any = await db.execute(sql`
      SELECT b.*, b.${sql.raw(d.userCol)} AS uid,
             COALESCE(p.stripe_payment_intent, NULL) AS stripe_payment_intent
      FROM bookings b
      LEFT JOIN payments p ON p.booking_id = b.id
      WHERE b.id=${id}
      LIMIT 1
    `);
    const b = r.rows[0]; if (!b) return res.status(404).json({ error: "Not found" });
    if (b.uid !== req.user.id) return res.status(403).json({ error: "Forbidden" });

    // No cancel if trip started
    const now = new Date();
    const startDate = new Date(b[d.startCol]);
    if (startDate <= now) return res.status(409).json({ error: "Trip already started." });

    // Pending -> just flip to canceled
    if (b[d.statusCol] === "pending") {
      await db.execute(sql`UPDATE bookings SET ${sql.raw(d.statusCol)}='canceled' WHERE id=${id}`);
      return res.json({ ok: true, status: "canceled" });
    }

    // Paid -> refund (Stripe if configured; else dev flip)
    if (b[d.statusCol] === "paid") {
      if (!stripe) {
        await db.execute(sql`UPDATE bookings SET ${sql.raw(d.statusCol)}='refunded' WHERE id=${id}`);
        try { await db.execute(sql`UPDATE payments SET status='refunded' WHERE booking_id=${id}`); } catch {}
        return res.json({ ok: true, status: "refunded", note: "Dev mode: STRIPE_SECRET_KEY missing" });
      }

      // Try to get Payment Intent
      let paymentIntentId: string | null = b.stripe_payment_intent ?? null;

      // Fallback: retrieve from stored session id
      if (!paymentIntentId && (b as any).stripe_session_id) {
        const sess = await stripe.checkout.sessions.retrieve((b as any).stripe_session_id as string, { expand: ["payment_intent"] });
        const pi = sess.payment_intent;
        if (typeof pi === "string") paymentIntentId = pi;
        else if (pi?.id) paymentIntentId = pi.id;
      }

      if (!paymentIntentId) return res.status(409).json({ error: "No payment to refund" });

      const refund = await stripe.refunds.create({ payment_intent: paymentIntentId, reason: "requested_by_customer" });

      // Amount & currency best-effort
      const amtRaw = Number(b[d.amountCol] ?? 0);
      const amount = (await discover()).usesCents ? amtRaw / 100 : amtRaw;
      const currency = (b.currency || "myr").toLowerCase();

      await db.execute(sql`UPDATE bookings SET ${sql.raw(d.statusCol)}='refunded' WHERE id=${id}`);

      // Write payments row without relying on a unique constraint
      await db.execute(sql`
        UPDATE payments
          SET stripe_payment_intent = ${paymentIntentId},
              amount = ${amount},
              currency = ${currency},
              status = 'refunded'
        WHERE booking_id = ${id}
      `);

      const check: any = await db.execute(sql`
        SELECT 1 FROM payments WHERE booking_id = ${id} LIMIT 1
      `);

      if (!check.rows?.length) {
        await db.execute(sql`
          INSERT INTO payments (booking_id, stripe_payment_intent, amount, currency, status)
          VALUES (${id}, ${paymentIntentId}, ${amount}, ${currency}, 'refunded')
        `);
      }


      return res.json({ ok: true, status: "refunded", refund_id: refund.id });
    }

    return res.status(409).json({ error: "Cannot cancel in this state." });
  } catch (e: any) {
    console.error("[bookings.cancel]", e?.message || e);
    res.status(500).json({ error: "Failed to cancel" });
  }
});

export default router;
