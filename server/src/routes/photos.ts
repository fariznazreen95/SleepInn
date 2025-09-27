import { Router } from "express";
import type { Request, Response } from "express";
import requireAuth from "../middleware/requireAuth";
import { requireOwner } from "../middleware/ownerGuard";
import { z } from "zod";
import { createImagePresign, createDevPresign } from "../services/storageService";
import { addPhoto } from "../services/photosService";
import { db } from "../db";
import { sql } from "drizzle-orm";

const router = Router();
const FORCE_S3 = process.env.FORCE_S3 === "true";

/**
 * POST /api/photos/presign
 * Body: { listingId:number, contentType:"image/*" }
 * Returns: { mode:"s3"|"dev", url, fields, key, publicUrl }
 */
router.post("/presign", requireAuth("host"), async (req: Request, res: Response) => {
  let body: { listingId: number; contentType: string };
  try {
    body = z.object({
      listingId: z.coerce.number().int().positive(),
      contentType: z.string().startsWith("image/"),
    }).parse(req.body ?? {});
  } catch (e:any) {
    return res.status(400).json({ error: e?.message || "Bad request" });
  }

  // Ownership check (soft fail → just warn; confirm route is owner-guarded anyway)
  try {
    const owned = await db.execute(sql`
      SELECT 1 FROM listings WHERE id=${body.listingId} AND host_id=${(req as any).user.id} LIMIT 1
    `);
    if ((owned as any).rows.length === 0) {
      return res.status(403).json({ error: "Not your listing." });
    }
  } catch (e:any) {
    console.warn("[photos.presign] ownership check error:", e?.message || e);
  }

  // Try real presign; if S3 missing/misconfigured and FORCE_S3=false → dev fallback
  try {
    const out = await createImagePresign(body.listingId, body.contentType);
    return res.json({ mode: "s3", ...out });
  } catch (e:any) {
    if (FORCE_S3) {
      return res.status(500).json({ error: "S3 required in this environment." });
    }
    const dev = createDevPresign(body.contentType);
    return res.json({ mode: "dev", ...dev });
  }
});

/**
 * POST /api/host/listings/:id/photos/confirm
 * Body: { url:string, key:string, order?:number }
 */
router.post("/:id/photos/confirm", requireAuth("host"), requireOwner, async (req: Request, res: Response) => {
  const listingId = Number(req.params.id);
  let body: { url: string; key: string; order: number };
  try {
    body = z.object({
      url: z.string().url(),
      key: z.string().min(1),
      order: z.number().int().min(0).default(0),
    }).parse(req.body ?? {});
  } catch (e:any) {
    return res.status(400).json({ error: e?.message || "Bad request" });
  }

  try {
    await addPhoto(listingId, body.url, body.key, body.order);
    return res.status(201).json({ ok: true });
  } catch (e:any) {
    console.error("[photos.confirm] error:", e);
    return res.status(400).json({ error: e?.message || "Failed to attach photo" });
  }
});

export default router;
