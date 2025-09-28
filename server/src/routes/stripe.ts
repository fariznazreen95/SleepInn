// server/src/routes/stripe.ts
import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import Stripe from "stripe";

const router = Router();

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const PUBLIC_URL = process.env.PUBLIC_URL || "http://localhost:5173";

const stripe = STRIPE_SECRET ? new Stripe(STRIPE_SECRET, { apiVersion: "2024-06-20" }) : null;

// add this helper near top of file
async function createCheckoutForBooking(id: number) {
  if (!id) throw new Error("booking param required");
  if (!stripe || !STRIPE_SECRET) throw new Error("Stripe not configured");

  const r: any = await db.execute(sql`
    SELECT b.*, l.title, l.city, l.country
    FROM bookings b
    JOIN listings l ON l.id = b.listing_id
    WHERE b.id = ${id}
    LIMIT 1
  `);
  const b = r.rows[0];
  if (!b) throw new Error("Booking not found");
  if (String(b.status) === "paid") throw new Error("Already paid");

  const cents =
    b.total_cents ?? b.amount_cents ?? Math.round(Number(b.total_amount ?? b.amount) * 100) ?? 0;
  const currency = (b.currency || "myr").toLowerCase();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{
      quantity: 1,
      price_data: {
        currency,
        unit_amount: Number(cents),
        product_data: {
          name: `Stay: ${b.title} — ${b.city}, ${b.country}`,
          description: `Booking #${b.id}: ${b.start_date} → ${b.end_date} for ${b.guests} guest(s)`
        }
      }
    }],
    success_url: `${PUBLIC_URL}/checkout/success?booking=${b.id}`,
    cancel_url: `${PUBLIC_URL}/trips?booking=${b.id}`,
    metadata: { bookingId: String(b.id) },
  });

  await db.execute(sql`UPDATE bookings SET stripe_session_id=${session.id} WHERE id=${id}`);
  return session.url!;
}

// keep your existing POST /checkout?booking=...
router.post("/checkout", async (req, res) => {
  try {
    const id = Number((req.query.booking as string) || req.body?.booking || 0);
    const url = await createCheckoutForBooking(id);
    res.json({ url });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || "Stripe error" });
  }
});

// NEW: support /checkout/:booking (POST)
router.post("/checkout/:booking", async (req, res) => {
  try {
    const id = Number(req.params.booking || 0);
    const url = await createCheckoutForBooking(id);
    res.json({ url });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || "Stripe error" });
  }
});

// Optional nicety: GET /checkout/:booking → redirect to Stripe
router.get("/checkout/:booking", async (req, res) => {
  try {
    const id = Number(req.params.booking || 0);
    const url = await createCheckoutForBooking(id);
    res.redirect(302, url);
  } catch (e: any) {
    res.status(400).send(e?.message || "Stripe error");
  }
});

async function amountInCents(row: any): Promise<number> {
  if (row.total_cents != null) return Number(row.total_cents);
  if (row.amount_cents != null) return Number(row.amount_cents);
  if (row.total_amount != null) return Math.round(Number(row.total_amount) * 100);
  if (row.amount != null) return Math.round(Number(row.amount) * 100);
  return 0;
}

// POST /api/stripe/checkout?booking=123
router.post("/checkout", async (req: Request, res: Response) => {
  try {
    const id = Number((req.query.booking as string) || 0);
    if (!id) return res.status(400).json({ error: "booking param required" });
    if (!stripe || !STRIPE_SECRET) return res.status(400).json({ error: "Stripe not configured" });

    const r: any = await db.execute(sql`
      SELECT b.*, l.title, l.city, l.country
      FROM bookings b
      JOIN listings l ON l.id = b.listing_id
      WHERE b.id = ${id}
      LIMIT 1
    `);
    const b = r.rows[0];
    if (!b) return res.status(404).json({ error: "Booking not found" });
    if (String(b.status) === "paid") return res.status(409).json({ error: "Already paid" });

    const cents = await amountInCents(b);
    const currency = (b.currency || "myr").toLowerCase();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: {
          currency,
          unit_amount: cents,
          product_data: {
            name: `Stay: ${b.title} — ${b.city}, ${b.country}`,
            description: `Booking #${b.id}: ${b.start_date} → ${b.end_date} for ${b.guests} guest(s)`
          }
        }
      }],
      success_url: `${PUBLIC_URL}/checkout/success?booking=${b.id}`,
      cancel_url: `${PUBLIC_URL}/trips?booking=${b.id}`,
      metadata: { bookingId: String(b.id) },
    });

    // Store session id for webhook/refund lookup
    await db.execute(sql`UPDATE bookings SET stripe_session_id=${session.id} WHERE id=${id}`);

    return res.json({ url: session.url });
  } catch (e: any) {
    console.error("[stripe.checkout] error:", e?.message || e);
    return res.status(500).json({ error: "Stripe error" });
  }
});

export default router;
