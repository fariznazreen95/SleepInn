import { Router } from "express";
import requireAuth from "../middleware/requireAuth";
import { requireOwner } from "../middleware/ownerGuard";
import { z } from "zod";
import { createImagePresign } from "../services/storageService";
import { addPhoto } from "../services/photosService";

const router = Router();

/**
 * POST /api/photos/presign
 * Try to create a real presign; if storage isn't configured,
 * return a placeholder so the UI can proceed in dev.
 */
router.post("/presign", requireAuth("host"), async (req, res) => {
  const body = z
    .object({
      listingId: z.coerce.number(),
      contentType: z.string().startsWith("image/"),
    })
    .parse(req.body);

  try {
    const presign = await createImagePresign(body.listingId, body.contentType);
    return res.json(presign);
  } catch (e: any) {
    // ⛑️ Fallback when S3_* envs are missing
    console.warn("[photos.presign] storage not configured, using placeholder:", e?.message || e);
    const key = `placeholder/${Date.now()}.jpg`;
    const publicUrl = "https://placehold.co/800x600/png?text=Photo";
    return res.json({
      url: "about:blank", // no real upload
      fields: {},         // keep the shape
      key,
      publicUrl,
      __fallback: true,   // flag for client
    });
  }
});

/**
 * POST /api/host/listings/:id/photos/confirm
 * Inserts a photo row for the listing (works for both real + fallback).
 */
router.post("/:id/photos/confirm", requireAuth("host"), requireOwner, async (req, res) => {
  const id = Number(req.params.id);
  const body = z
    .object({
      url: z.string().url(),
      key: z.string(),
      order: z.number().int().min(0).default(0),
    })
    .parse(req.body);

  await addPhoto(id, body.url, body.key, body.order);
  return res.status(201).json({ ok: true });
});

export default router;
