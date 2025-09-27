import { Router } from "express";
import type { Response } from "express";
import { z } from "zod";
import requireAuth from "../middleware/requireAuth";
import { db } from "../db";
import { sql } from "drizzle-orm";

const router = Router();

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
  } catch (e: any) {
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

// Create booking (pending), block paid + fresh (<30m) pending
router.post("/", requireAuth(), async (req: any, res: Response) => {
  try {
    const { listingId, start, end, guests } = CreateBody.parse(req.body ?? {});
    const d = await discover();

    const conflict = await db.execute(sql`
      SELECT 1 FROM bookings b
      WHERE b.${sql.raw(d.listingCol)} = ${listingId}
        AND (
          b.${sql.raw(d.statusCol)} = 'paid'
          OR (b.${sql.raw(d.statusCol)} = 'pending' AND b.created_at > NOW() - INTERVAL '30 minutes')
        )
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
    if (d.expiresCol)  { cols.push(d.expiresCol);  vals.push(sql`NOW() + INTERVAL '20 minutes'`); }

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

// Cancel / refund (dev)
router.post("/:id/cancel", requireAuth(), async (req: any, res: Response) => {
  try {
    const id = Number(req.params.id);
    const d = await discover();
    const r: any = await db.execute(sql`SELECT *, ${sql.raw(d.userCol)} AS uid FROM bookings WHERE id=${id} LIMIT 1`);
    const b = r.rows[0]; if (!b) return res.status(404).json({ error: "Not found" });
    if (b.uid !== req.user.id) return res.status(403).json({ error: "Forbidden" });

    const now = new Date();
    const startDate = new Date(b[d.startCol]);
    if (startDate <= now) return res.status(409).json({ error: "Trip already started." });

    if (b[d.statusCol] === "pending") {
      await db.execute(sql`UPDATE bookings SET ${sql.raw(d.statusCol)}='canceled' WHERE id=${id}`);
      return res.json({ ok: true, status: "canceled" });
    }
    if (b[d.statusCol] === "paid") {
      await db.execute(sql`UPDATE bookings SET ${sql.raw(d.statusCol)}='refunded' WHERE id=${id}`);
      return res.json({ ok: true, status: "refunded" });
    }
    res.status(409).json({ error: "Cannot cancel in this state." });
  } catch (e: any) {
    console.error("[bookings.cancel]", e?.message || e);
    res.status(500).json({ error: "Failed to cancel" });
  }
});

export default router;
