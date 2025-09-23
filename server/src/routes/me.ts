import { Router } from 'express';
import requireAuth from '../middleware/requireAuth';
import { db } from '../db';
import { users } from '../schema'; // << correct path
import { eq } from 'drizzle-orm';

const router = Router();

router.get('/me', requireAuth(), async (req, res) => {
  const id = req.user!.id;
  const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  res.json({ id: u.id, email: u.email, name: u.name, role: u.role });
});

export default router;
