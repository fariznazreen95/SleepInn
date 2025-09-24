import { Router } from "express";
import requireAuth from "../middleware/requireAuth";
import { db } from "../db";
import { users } from "../schema";
import { eq } from "drizzle-orm";
import { verifyPassword, hashPassword } from "../auth/crypto";
import { z } from "zod";

const router = Router();

/**
 * POST /api/change-password
 * Body: { oldPassword: string, newPassword: string }
 */
router.post("/change-password", requireAuth(), async (req: any, res) => {
  try {
    const { oldPassword, newPassword } = z
      .object({
        oldPassword: z.string().min(1),
        newPassword: z.string().min(6),
      })
      .parse(req.body ?? {});

    const uid = req.user?.id;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    const rows = await db.select().from(users).where(eq(users.id, uid)).limit(1);
    const u: any = rows[0];
    if (!u?.password_hash) return res.status(400).json({ error: "No password set" });

    const ok = await verifyPassword(oldPassword, u.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid old password" });

    const newHash = await hashPassword(newPassword);
    await db.update(users).set({ password_hash: newHash }).where(eq(users.id, uid));

    return res.json({ ok: true });
  } catch (e: any) {
    if (e?.issues) return res.status(400).json({ error: "Invalid payload" });
    console.error("[change-password] error", e);
    return res.status(500).json({ error: "Failed to change password" });
  }
});

export default router;
