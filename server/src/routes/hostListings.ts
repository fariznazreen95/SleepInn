import { Router } from "express";
import requireAuth from "../middleware/requireAuth";
import { requireOwner } from "../middleware/ownerGuard";
import { z } from "zod";
import { createListing, listMyListings, publishListing, updateListing } from "../services/listingsService";
import { sql } from "drizzle-orm";
import { db } from "../db";

const router = Router();

// Coerce numbers so form posts like "123" are accepted
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

// Create new listing → returns { id }
router.post("/", requireAuth("host"), async (req: any, res) => {
  try {
    const data = upsertSchema.parse(req.body);
    const created = await createListing(req.user.id, data);
    return res.status(201).json(created);
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Invalid payload" });
  }
});

// List mine
router.get("/mine", requireAuth("host"), async (req: any, res) => {
  const out = await listMyListings(req.user.id);
  return res.json(out);
});

// Update listing
router.put("/:id", requireAuth("host"), requireOwner, async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    const data = upsertSchema.partial().parse(req.body);
    const out = await updateListing(id, req.user.id, data);
    return res.json(out);
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Invalid payload" });
  }
});

// Publish (enforce at least one photo before allowing publish)
router.post("/:id/publish", requireAuth("host"), requireOwner, async (req: any, res) => {
  const id = Number(req.params.id);
  try {
    // ANCHOR: ENFORCE-PHOTO-BEFORE-PUBLISH
    const photos = await db.execute(sql`
      SELECT 1 FROM photos WHERE listing_id = ${id} LIMIT 1
    `);
    if (!(photos as any).rows.length) {
      return res.status(400).json({ error: "Add at least one photo before publishing." });
    }
    // ANCHOR: ENFORCE-PHOTO-BEFORE-PUBLISH-END

    // Delegate to service (sets published flag, etc.)
    const out = await publishListing(id, req.user.id);
    return res.json(out);
  } catch (e: any) {
    return res.status(e?.status || 500).json({ error: e?.message || "Publish failed" });
  }
});

export default router;
