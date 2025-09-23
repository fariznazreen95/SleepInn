import { Router } from "express";
import requireAuth from "../middleware/requireAuth";
import { requireOwner } from "../middleware/ownerGuard";
import { z } from "zod";
import { createImagePresign } from "../services/storageService";
import { addPhoto } from "../services/photosService";

const router = Router();

router.post("/presign", requireAuth("host"), async (req, res) => {
  const body = z.object({
    listingId: z.coerce.number(),
    contentType: z.string().startsWith("image/"),
  }).parse(req.body);

  const presign = await createImagePresign(body.listingId, body.contentType);
  res.json(presign);
});

router.post("/:id/photos/confirm", requireAuth("host"), requireOwner, async (req, res) => {
  const id = Number(req.params.id);
  const body = z.object({
    url: z.string().url(),
    key: z.string(),
    order: z.number().int().min(0).default(0),
  }).parse(req.body);

  await addPhoto(id, body.url, body.key, body.order);
  res.status(201).json({ ok: true });
});

export default router;
