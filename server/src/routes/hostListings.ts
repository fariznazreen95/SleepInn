import { Router } from "express";
import requireAuth from "../middleware/requireAuth";
import { requireOwner } from "../middleware/ownerGuard";
import { z } from "zod";
import { createListing, listMyListings, publishListing, updateListing } from "../services/listingsService";

const router = Router();

const upsertSchema = z.object({
  title: z.string().min(3),
  city: z.string().min(2),
  pricePerNight: z.number().int().positive(),
  beds: z.number().int().positive(),
  baths: z.number().int().min(0),
  instant: z.boolean().optional().default(false),
  description: z.string().min(10),
});

router.use(requireAuth("host"));

router.get("/mine", async (req: any, res) => {
  const rows = await listMyListings(req.user.id);
  res.json({ items: rows });
});

router.post("/", async (req: any, res) => {
  const data = upsertSchema.parse(req.body);
  const created = await createListing(req.user.id, data);
  res.status(201).json(created);
});

router.put("/:id", requireOwner, async (req: any, res) => {
  const id = Number(req.params.id);
  const data = upsertSchema.partial().parse(req.body);
  const out = await updateListing(id, req.user.id, data);
  res.json(out);
});

router.post("/:id/publish", requireOwner, async (req: any, res) => {
  const id = Number(req.params.id);
  const out = await publishListing(id, req.user.id);
  res.json(out);
});

export default router;
