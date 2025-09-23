// sleepinn/server/src/middleware/ownerGuard.ts
import type { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Ensure the current user owns the listing (or is admin).
 * Requires req.user to be set by requireAuth middleware.
 */
export async function requireOwner(req: Request, res: Response, next: NextFunction) {
  try {
    const user: any = (req as any).user;
    if (!user?.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const id = Number((req.params as any).id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const result = await db.execute(sql`
      SELECT id, host_id
      FROM listings
      WHERE id = ${id}
      LIMIT 1
    `);

    const row = (result as any).rows?.[0];
    if (!row) return res.status(404).json({ error: "Listing not found" });

    if (row.host_id !== user.id && user.role !== "admin") {
      return res.status(403).json({ error: "Not your listing" });
    }

    (req as any).listing = row;
    next();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal error" });
  }
}
