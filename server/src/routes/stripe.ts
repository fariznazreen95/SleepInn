import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";

const router = Router();

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const PUBLIC_URL = process.env.PUBLIC_URL || "http://localhost:5173";

async function amountInCents(b: any): Promise<number> {
  if (b.total_cents != null) return Number(b.total_cents);
  if (b.amount_cents != null) return Number(b.amount_cents);
  if (b.total_amount != null) return Math.round(Number(b.total_amount) * 100);
  if (b.amount != null) return Math.round(Number(b.amount) * 100);
  return 0;
}
function pickStatusCol(row: any) {
  return Object.prototype.hasOwnProperty.call(row, "status") ? "status" : "state";
}
function pickSessCol(row: any) {
  if (Object.prototype.hasOwnProperty.call(row, "stripe_session_id")) return "stripe_session_id";
  return null;
}

router.post("/checkout/:bookingId", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.bookingId);
    const rows: any = await db.execute(sql`SELECT * FROM bookings WHERE id=${id} LIMIT 1`);
    const b = rows.rows[0];
    if (!b) return res.status(404).json({ error: "Booking not found" });

    const statusCol = pickStatusCol(b);
    const sessCol = pickSessCol(b);
    const amt = await amountInCents(b);
    const currency = String(b.currency || "myr").toLowerCase();

    if (!STRIPE_SECRET) {
      await db.execute(sql`UPDATE bookings SET ${sql.raw(statusCol)}='paid' WHERE id=${id}`);
      return res.json({ url: `${PUBLIC_URL}/success?booking=${id}`, dev: true });
    }

    const stripe = (await import("stripe")).default;
    const s = new stripe(STRIPE_SECRET, { apiVersion: "2023-10-16" as any });
    const session = await s.checkout.sessions.create({
      mode: "payment",
      success_url: `${PUBLIC_URL}/success?booking=${id}`,
      cancel_url: `${PUBLIC_URL}/cancel?booking=${id}`,
      metadata: { bookingId: String(id) },
      line_items: [{
        price_data: {
          currency,
          product_data: { name: `Stay #${id}` },
          unit_amount: amt,
        },
        quantity: 1
      }]
    });

    if (sessCol) {
      await db.execute(sql`UPDATE bookings SET ${sql.raw(sessCol)}=${session.id} WHERE id=${id}`);
    }
    return res.json({ url: session.url });
  } catch (e: any) {
    console.error("[stripe.checkout] error:", e?.message || e);
    return res.status(500).json({ error: "Stripe error" });
  }
});

export default router;
