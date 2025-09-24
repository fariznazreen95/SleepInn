import { Router } from 'express';
import { db } from '../db';
import { users } from '../schema';
import { eq } from 'drizzle-orm';
import { hashPassword, verifyPassword, signToken } from '../auth/crypto';

const router = Router();

// Optional ping to verify mount
router.get('/__ping', (_req, res) => res.json({ ok: true, where: 'auth' }));

// REGISTER (guarded by ALLOW_REGISTRATION)
router.post('/register', async (req, res) => {
  try {
    if (process.env.ALLOW_REGISTRATION !== 'true') {
      return res.status(403).json({ error: 'Registration disabled' });
    }

    const { email, password, name } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password required' });
    }

    const exists = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (exists.length) return res.status(409).json({ error: 'Email already in use' });

    const password_hash = await hashPassword(password);
    // role defaults to 'user' via schema; you can set 'host' here if desired
    const [u] = await db.insert(users).values({ email, name, password_hash }).returning();

    const token = signToken({ id: u.id, email: u.email, role: u.role });
    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',    // dev
      secure: false,      // dev
      path: '/',
      maxAge: 7 * 24 * 3600 * 1000,
    });
    return res.json({ id: u.id, email: u.email, name: u.name, role: u.role });
  } catch (e) {
    console.error('[REGISTER] error', e);
    return res.status(500).json({ error: 'Failed to register' });
  }
});

// LOGIN
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Missing email or password' });
    }

    const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const u = rows[0];
    console.log('[LOGIN] fetched', !!u, u ? { id: u.id, role: u.role, hasHash: !!(u as any).password_hash } : {});

    if (!u?.password_hash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const ok = await verifyPassword(password, (u as any).password_hash);
    console.log('[LOGIN] compare', ok);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken({ id: u.id, email: u.email, role: u.role });
    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',    // dev
      secure: false,      // dev
      path: '/',
      maxAge: 7 * 24 * 3600 * 1000,
    });
    return res.json({ id: u.id, email: u.email, name: u.name, role: u.role });
  } catch (e) {
    console.error('[LOGIN] error', e);
    return res.status(500).json({ error: 'Failed to login' });
  }
});

// LOGOUT
router.post('/logout', async (_req, res) => {
  res.clearCookie('token', { path: '/' }).json({ ok: true });
});

export default router;
