import { Router } from 'express';
import { db } from '../db';
import { users } from '../schema'; // << correct path for your repo layout
import { eq } from 'drizzle-orm';
import { hashPassword, verifyPassword, signToken } from '../auth/crypto';

const router = Router();

// optional ping to verify mount
router.get('/__ping', (_req, res) => res.json({ ok: true, where: 'auth-router' }));

router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    const exists = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (exists.length) return res.status(409).json({ error: 'Email already in use' });

    const passwordHash = await hashPassword(password);
    const [u] = await db.insert(users).values({ email, passwordHash, name }).returning();

    const token = signToken({ id: u.id, email: u.email, role: u.role });
    res
      .cookie('token', token, { httpOnly: true, sameSite: 'lax' })
      .json({ id: u.id, email: u.email, name: u.name, role: u.role });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to register' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!u) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await verifyPassword(password, u.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken({ id: u.id, email: u.email, role: u.role });
    res
      .cookie('token', token, { httpOnly: true, sameSite: 'lax' })
      .json({ id: u.id, email: u.email, name: u.name, role: u.role });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to login' });
  }
});

router.post('/logout', async (_req, res) => {
  res.clearCookie('token').json({ ok: true });
});

export default router;
