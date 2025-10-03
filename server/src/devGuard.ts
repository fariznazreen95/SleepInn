// devGuard.ts — add once, keep forever
import type { Request, Response, NextFunction } from "express";

// bump this whenever you change critical server logic;
// or compute from git/mtime if you want (fast static is fine for dev)
export const SERVER_VERSION = `dev-${new Date().toISOString()}`;

export function devGuardHeaders(req: Request, res: Response, next: NextFunction) {
  // mark all API responses as non-cacheable in dev
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Server-Version", SERVER_VERSION);
  next();
}

// simple health route factory you can mount
export function makeHealthRouter(express: any) {
  const r = express.Router();
  const bootAt = new Date().toISOString();
  r.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true, bootAt, version: SERVER_VERSION, pid: process.pid, uptimeSec: Math.round(process.uptime()) });
  });
  return r;
}
