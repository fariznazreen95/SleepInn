import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../auth/crypto';
import type { JwtUser, Role } from '../auth/types';

export default function requireAuth(role?: Role) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const bearer = req.header('authorization');
      const token =
        (req.cookies && req.cookies.token) ||
        (bearer?.startsWith('Bearer ') ? bearer.slice(7) : undefined);

      if (!token) return res.status(401).json({ error: 'Unauthorized' });

      const decoded = verifyToken(token) as JwtUser;
      if (role && decoded.role !== role) return res.status(403).json({ error: 'Forbidden' });

      req.user = decoded;
      next();
    } catch {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  };
}
