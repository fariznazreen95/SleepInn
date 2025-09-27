// server/src/webhooks/stripeWebhook.ts
import type { Request, Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

export default async function stripeWebhook(req: Request, res: Response) {
  if (!STRIPE_SECRET || !STRIPE_WEBHOOK_SECRET) {
    return res.status(400).json({ error: "Stripe webhook not configured." });
  }

  // req.body is a Buffer because we use express.raw() on this route
  const buf = req.body as Buffer;
  const sig = req.headers["stripe-signature"] as string | undefined;

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(STRIPE_SECRET, { apiVersion: "2023-10-16" as any });
    const event = stripe.webhooks.constructEvent(buf, sig!, STRIPE_WEBHOOK_SECRET);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as any; // Stripe.Checkout.Session
      const idFromMeta = session?.metadata?.bookingId ? Number(session.metadata.bookingId) : null;
      const sessId = session?.id as string | undefined;

      // Prefer metadata.bookingId; fall back to stored stripe_session_id
      if (idFromMeta) {
        await db.execute(sql`UPDATE bookings SET status='paid' WHERE id=${idFromMeta}`);
      } else if (sessId) {
        await db.execute(sql`UPDATE bookings SET status='paid' WHERE stripe_session_id=${sessId}`);
      }
    }

    return res.json({ received: true });
  } catch (e: any) {
    console.error("[stripe.webhook] error:", e?.message || e);
    return res.status(400).send(`Webhook Error: ${e?.message || "invalid payload"}`);
  }
}
