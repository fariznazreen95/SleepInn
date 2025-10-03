import { Router } from "express";
import requireAuth from "../middleware/requireAuth";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { createListing, updateListing, publishListing } from "../services/listingsService";

const router = Router();

const upsertSchema = z.object({
  title: z.string().min(3),
  city: z.string().min(2),
  country: z.string().min(2).default("Malaysia"),
  pricePerNight: z.coerce.number().int().positive(),
  beds: z.coerce.number().int().positive(),
  baths: z.coerce.number().int().min(0),
  instant: z.coerce.boolean().optional().default(false),
  description: z.string().min(1),
});

// CREATE
router.post("/listings", requireAuth("host"), async (req: any, res) => {
  try {
    const data = upsertSchema.parse(req.body);
    const created = await createListing(Number(req.user.id), data);
    return res.status(201).json(created);
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Invalid payload" });
  }
});

// LIST MINE
router.get("/listings", requireAuth("host"), async (req: any, res) => {
  const hostId = Number(req.user.id);
  if (!Number.isFinite(hostId)) {
    return res.status(400).json({ error: "Invalid user id" });
  }
  try {
    const r: any = await db.execute(sql`
      SELECT
        l.id,
        l.title,
        l.city,
        l.country,
        l.price_per_night::numeric AS "pricePerNight",
        l.beds,
        l.baths,
        (l.published IS TRUE)       AS "published",
        (l.is_instant_book IS TRUE) AS "instant",
        CASE WHEN l.published IS TRUE THEN 'published' ELSE 'draft' END AS "status",
        COALESCE((
          SELECT p.url
          FROM photos p
          WHERE p.listing_id = l.id
          ORDER BY p.id DESC
          LIMIT 1
        ), '') AS "coverUrl",
        l.created_at AS "createdAt"
      FROM listings l
      WHERE l.host_id = ${hostId}
      ORDER BY l.id DESC
    `);
    return res.json(r.rows ?? []);
  } catch (e: any) {
    console.error("[host:listings:list]", e);
    return res.status(500).json({ error: e?.message || "Failed to load listings" });
  }
});

// READ ONE
router.get("/listings/:id", requireAuth("host"), async (req: any, res) => {
  const id = Number(req.params.id);
  const hostId = Number(req.user.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  if (!Number.isFinite(hostId)) return res.status(400).json({ error: "Invalid user id" });

  try {
    const r: any = await db.execute(sql`
      SELECT
        l.id,
        l.host_id,
        l.title,
        l.city,
        l.country,
        l.price_per_night::numeric AS "pricePerNight",
        l.beds,
        l.baths,
        l.description,
        (l.published IS TRUE)       AS "published",
        (l.is_instant_book IS TRUE) AS "instant",
        CASE WHEN l.published IS TRUE THEN 'published' ELSE 'draft' END AS "status",
        COALESCE((
          SELECT p.url
          FROM photos p
          WHERE p.listing_id = l.id
          ORDER BY p.id DESC
          LIMIT 1
        ), '') AS "coverUrl",
        l.created_at AS "createdAt"
      FROM listings l
      WHERE l.id = ${id} AND l.host_id = ${hostId}
      LIMIT 1
    `);

    const row = r?.rows?.[0];
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch (e: any) {
    console.error("[host:listings:read]", e);
    return res.status(500).json({ error: e?.message || "Failed to fetch listing" });
  }
});

// UPDATE
router.put("/listings/:id", requireAuth("host"), async (req: any, res) => {
  const id = Number(req.params.id);
  const hostId = Number(req.user.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  if (!Number.isFinite(hostId)) return res.status(400).json({ error: "Invalid user id" });

  try {
    const own: any = await db.execute(sql`
      SELECT 1 FROM listings WHERE id=${id} AND host_id=${hostId} LIMIT 1
    `);
    if (!own.rows?.length) return res.status(403).json({ error: "Not your listing" });

    const data = upsertSchema.partial().parse(req.body);
    const out = await updateListing(id, hostId, data);
    return res.json(out);
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Invalid payload" });
  }
});

// PUBLISH
router.post("/listings/:id/publish", requireAuth("host"), async (req: any, res) => {
  const id = Number(req.params.id);
  const hostId = Number(req.user.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
  if (!Number.isFinite(hostId)) return res.status(400).json({ error: "Invalid user id" });

  try {
    const own: any = await db.execute(sql`
      SELECT 1 FROM listings WHERE id=${id} AND host_id=${hostId} LIMIT 1
    `);
    if (!own.rows?.length) return res.status(403).json({ error: "Not your listing" });

    const photos: any = await db.execute(sql`
      SELECT 1 FROM photos WHERE listing_id=${id} LIMIT 1
    `);
    if (!photos.rows?.length) {
      return res.status(400).json({ error: "Add at least one photo before publishing." });
    }

    const out = await publishListing(id, hostId);
    return res.json(out);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Publish failed" });
  }
});

export default router;
