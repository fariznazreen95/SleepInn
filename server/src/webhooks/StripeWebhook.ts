// server/src/webhooks/StripeWebhook.ts
import type { Request, Response } from "express";
import Stripe from "stripe";
import { db } from "../db";
import { sql } from "drizzle-orm";

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY!;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

const stripe = new Stripe(STRIPE_SECRET, { apiVersion: "2024-06-20" });

export default async function stripeWebhook(req: Request, res: Response) {
  try {
    const sig = req.headers["stripe-signature"] as string | undefined;
    if (!sig) return res.status(400).json({ error: "No signature" });

    const event = stripe.webhooks.constructEvent(req.body as Buffer, sig, STRIPE_WEBHOOK_SECRET);

    if (event.type === "checkout.session.completed") {
      const s = event.data.object as Stripe.Checkout.Session;

      // Resolve booking id
      const bookingId = Number(s.metadata?.bookingId || 0);

      // Extract PI id
      let payment_intent_id: string | null = null;
      if (typeof s.payment_intent === "string") payment_intent_id = s.payment_intent;
      else if ((s.payment_intent as any)?.id) payment_intent_id = (s.payment_intent as any).id;

      // Mark booking paid
      if (bookingId) {
        await db.execute(sql`UPDATE bookings SET status='paid', stripe_session_id=${s.id} WHERE id=${bookingId}`);
      } else {
        // fallback by session id
        await db.execute(sql`UPDATE bookings SET status='paid' WHERE stripe_session_id=${s.id}`);
      }

      // Upsert payments row
      if (bookingId && payment_intent_id) {
        const amount = (s.amount_total ?? 0) / 100;
        const currency = (s.currency ?? "myr").toLowerCase();
        await db.execute(sql`
          INSERT INTO payments (booking_id, stripe_payment_intent, amount, currency, status)
          VALUES (${bookingId}, ${payment_intent_id}, ${amount}, ${currency}, 'succeeded')
          ON CONFLICT (booking_id) DO UPDATE
            SET stripe_payment_intent=EXCLUDED.stripe_payment_intent,
                amount=EXCLUDED.amount,
                currency=EXCLUDED.currency,
                status='succeeded'
        `);
      }
    }

    return res.json({ received: true });
  } catch (e: any) {
    console.error("[stripe.webhook] error:", e?.message || e);
    return res.status(400).send(`Webhook Error: ${e?.message || "invalid payload"}`);
  }
}
