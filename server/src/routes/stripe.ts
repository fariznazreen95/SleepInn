// server/src/routes/stripe.ts
import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import Stripe from "stripe";
import { computeQuote, toCents } from "../services/quote";

const router = Router();

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY ?? "";
const PUBLIC_URL = process.env.PUBLIC_URL || "http://localhost:5173";
const CURRENCY_OVERRIDE = (process.env.STRIPE_CURRENCY || "").toLowerCase();

const stripe = STRIPE_SECRET ? new Stripe(STRIPE_SECRET, { apiVersion: "2024-06-20" }) : null;

// ---- helpers ----
function toDateStr(v: any): string | undefined {
  if (v == null) return undefined;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : undefined;
}

async function bookingCols(): Promise<Set<string>> {
  const r: any = await db.execute(sql`
    SELECT column_name FROM information_schema.columns WHERE table_name='bookings'
  `);
  return new Set((r.rows || []).map((x: any) => String(x.column_name)));
}

// Single source of truth for amount: compute from the same quote helper
async function createCheckoutForBooking(id: number): Promise<string> {
  if (!id) throw new Error("booking param required");
  if (!stripe) throw new Error("Stripe not configured");

  const r: any = await db.execute(sql`
    SELECT
      b.*,
      l.title, l.city, l.country
    FROM bookings b
    JOIN listings l ON l.id = b.listing_id
    WHERE b.id = ${id}
    LIMIT 1
  `);

  const b = r?.rows?.[0];
  if (!b) throw new Error("Booking not found");
  if (String(b.status) === "paid") throw new Error("Already paid");
  if (String(b.status) !== "pending") throw new Error("Only pending bookings can be paid");

  // Normalize field names across schema variants
  const startStr =
    toDateStr(b.start_date) ??
    toDateStr(b.start) ??
    toDateStr(b.checkin_date) ??
    toDateStr(b.check_in) ??        // added
    toDateStr(b.from_date);

  const endStr =
    toDateStr(b.end_date) ??
    toDateStr(b.end) ??
    toDateStr(b.checkout_date) ??
    toDateStr(b.check_out) ??       // added
    toDateStr(b.to_date);

  const guestsNum = Number(
    b.guests ?? b.guest_count ?? b.guests_count ?? b.num_guests ?? 1
  );

  if (!startStr || !endStr || !Number.isFinite(guestsNum)) {
    throw new Error("Booking is missing dates/guests");
  }

  // Recompute from the SAME quote function to avoid drift
  const quote = await computeQuote({
    listingId: Number(b.listing_id),
    start: startStr,
    end: endStr,
    guests: guestsNum,
    feeRate: 0.10,
  });

  const cents = toCents(quote.total);
  if (!Number.isFinite(cents) || Number(cents) <= 0) throw new Error("Invalid amount");

  const currency = (CURRENCY_OVERRIDE || b.currency || "myr").toLowerCase();

  // Persist for consistency — schema-aware (only set columns that exist)
  const cols = await bookingCols();
  const setFrags: any[] = [];

  if (cols.has("amount_cents")) {
    setFrags.push(sql`amount_cents = ${cents}`);
  } else if (cols.has("amount")) {
    setFrags.push(sql`amount = ${(Number(cents) / 100)}`);
  }
  if (cols.has("currency")) {
    setFrags.push(sql`currency = ${currency}`);
  }

  if (setFrags.length > 0) {
    await db.execute(sql`
      UPDATE bookings
         SET ${sql.join(setFrags, sql`, `)}
       WHERE id = ${id}
    `);
  }

  // Create Stripe Checkout session
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: Number(cents),
          product_data: {
            name: `Stay: ${b.title} — ${b.city}, ${b.country}`,
            description: `Booking #${b.id}: ${startStr} → ${endStr} for ${guestsNum} guest(s)`,
          },
        },
      },
    ],
    success_url: `${PUBLIC_URL}/checkout/success?booking=${b.id}`,
    cancel_url: `${PUBLIC_URL}/trips?booking=${b.id}`,
    metadata: { bookingId: String(b.id) },
  });

  await db.execute(sql`UPDATE bookings SET stripe_session_id = ${session.id} WHERE id = ${id}`);

  if (!session.url) throw new Error("No checkout URL");
  return session.url;
}

// POST /api/stripe/checkout?booking=123  (or body { booking: 123 })
router.post("/checkout", async (req: Request, res: Response) => {
  try {
    const id = Number((req.query.booking as string) || (req.body?.booking as any) || 0);
    const url = await createCheckoutForBooking(id);
    res.json({ url });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || "Stripe error" });
  }
});

// POST /api/stripe/checkout/123
router.post("/checkout/:booking", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.booking || 0);
    const url = await createCheckoutForBooking(id);
    res.json({ url });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || "Stripe error" });
  }
});

// GET /api/stripe/checkout/123 → 302 to Stripe (nice shortcut)
router.get("/checkout/:booking", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.booking || 0);
    const url = await createCheckoutForBooking(id);
    res.redirect(302, url);
  } catch (e: any) {
    res.status(400).send(e?.message || "Stripe error");
  }
});

export default router;
