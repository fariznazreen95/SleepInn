import express from 'express';
import cors from 'cors';
import { ServerConfig } from './serverConfig';
import { db } from './db';
import { sql } from 'drizzle-orm';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth';
import meRoute from './routes/me';
import requireAuth from './middleware/requireAuth';
import hostListings from './routes/hostListings';
import photos from './routes/photos';
import changePassword from "./routes/changePassword";
import availability from "./routes/availability";
import pricing from "./routes/pricing";
import bookings from "./routes/bookings";
import stripeRoutes from "./routes/stripe";
import stripeWebhook from "./webhooks/stripeWebhook";


const app = express();

app.use(cors({
  origin: ["http://localhost:5173", "http://127.0.0.1:5173"], // add your web origin(s)
  credentials: true, // <— REQUIRED for cookies
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// ⛳ ANCHOR: STRIPE-WEBHOOK-MOUNT (must be BEFORE express.json())
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhook);
app.use(express.json());
app.use(cookieParser());

// Auth mounts
app.use('/api/auth', authRoutes);
app.use('/api', meRoute);
app.use("/api", availability);
app.use("/api", pricing);
app.use("/api/change-password", changePassword);
app.use('/api/host/listings', hostListings);
app.use('/api/host/listings', photos); // /:id/photos/confirm
app.use('/api/photos', photos);        // /photos/presign
app.use("/api/bookings", bookings);
app.use("/api/stripe", stripeRoutes);


// Quick protected test route
app.get('/api/protected', requireAuth(), (req, res) => {
  res.json({ ok: true, user: req.user });
});

// Health
app.get('/health', async (_req, res) => {
  try {
    await db.execute(sql`select 1 as ok`);
    res.json({ ok: true, service: 'sleepinn-api' });
  } catch {
    res.status(500).json({ ok: false, error: 'db_unreachable' });
  }
});

// ---- Cities (distinct) -------------------------------------------------------
app.get('/api/cities', async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT DISTINCT city FROM listings
      WHERE city IS NOT NULL AND city <> ''
      ORDER BY city ASC
    `);
    res.json(rows.rows.map((r: { city: string }) => r.city));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch cities' });
  }
});

// ---- Listings with filters ---------------------------------------------------
// GET /api/listings?city=&min=&max=&instant=true&limit=24&offset=0&start=YYYY-MM-DD&end=YYYY-MM-DD&guests=2
app.get('/api/listings', async (req, res) => {
  const { city, min, max, instant, limit, offset, sort, start, end, guests } =
    req.query as Record<string, string | undefined>;

  const SORT_MAP: Record<string, string> = {
    price_asc: 'l.price_per_night ASC',
    price_desc: 'l.price_per_night DESC',
    newest: 'l.id DESC',
  };
  const orderBy = SORT_MAP[sort ?? ''] ?? 'l.id ASC';

  const ALLOWED_LIMITS = new Set([8, 12, 24, 48]);
  const DEFAULT_LIMIT = 8;
  const MIN_PRICE = 0;
  const MAX_PRICE = 100_000;

  let limParsed = Number(limit);
  if (!Number.isFinite(limParsed)) limParsed = DEFAULT_LIMIT;
  const lim = ALLOWED_LIMITS.has(limParsed) ? limParsed : DEFAULT_LIMIT;

  const minParsed = Number(min);
  const maxParsed = Number(max);
  let minRM = Number.isFinite(minParsed) ? Math.max(minParsed, MIN_PRICE) : MIN_PRICE;
  let maxRM = Number.isFinite(maxParsed) ? Math.min(maxParsed, MAX_PRICE) : MAX_PRICE;
  if (minRM > maxRM) [minRM, maxRM] = [maxRM, minRM];

  const offParsed = Number(offset);
  const off = Number.isFinite(offParsed) ? Math.max(Math.trunc(offParsed), 0) : 0;

  const isInstant = instant === 'true' || instant === '1';
  const cityRaw = (city ?? '').trim();
  const cityKey = cityRaw.replace(/\s+/g, '');

  const isYmd = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const startStr = start?.trim();
  const endStr = end?.trim();
  const useDate = isYmd(startStr) && isYmd(endStr);

  const guestsNum = Number(guests);
  const needGuests = Number.isFinite(guestsNum) ? Math.max(1, Math.trunc(guestsNum)) : undefined;

  // base WHERE for listings
  const baseWhere = sql`
    l.published = true
    ${cityKey ? sql` AND REPLACE(l.city, ' ', '') ILIKE ${'%' + cityKey + '%'} ` : sql``}
    AND (l.price_per_night)::numeric BETWEEN ${minRM} AND ${maxRM}
    ${isInstant ? sql` AND l.is_instant_book = true ` : sql``}
  `;

  try {
    // -------- With date range: compute eligible_ids once, then count + page --------
    if (useDate) {
      if ((startStr as string) > (endStr as string)) {
        return res.status(400).json({ error: 'start must be <= end' });
      }
      const capCheck = needGuests ? sql` OR a.guests < ${needGuests} ` : sql``;

      const totalRes = await db.execute(sql`
        WITH days AS (
          SELECT generate_series(${startStr}::date, ${endStr}::date, '1 day')::date AS "day"
        ),
        eligible_ids AS (
          SELECT l.id
          FROM listings l
          WHERE ${baseWhere}
            AND NOT EXISTS (
              SELECT 1
              FROM days d
              LEFT JOIN availability a
                ON a.listing_id = l.id
               AND a."day" = d."day"
              WHERE a."day" IS NULL
                 OR a.is_available = FALSE
                 ${capCheck}
            )
        )
        SELECT COUNT(*)::int AS total FROM eligible_ids
      `);
      const total: number = (totalRes as any).rows?.[0]?.total ?? 0;

      const listRes = await db.execute(sql`
        WITH days AS (
          SELECT generate_series(${startStr}::date, ${endStr}::date, '1 day')::date AS "day"
        ),
        eligible_ids AS (
          SELECT l.id
          FROM listings l
          WHERE ${baseWhere}
            AND NOT EXISTS (
              SELECT 1
              FROM days d
              LEFT JOIN availability a
                ON a.listing_id = l.id
               AND a."day" = d."day"
              WHERE a."day" IS NULL
                 OR a.is_available = FALSE
                 ${capCheck}
            )
        )
        SELECT
          l.id, l.title, l.description, l.price_per_night, l.city, l.country, l.beds, l.baths, l.is_instant_book
        FROM listings l
        JOIN eligible_ids e ON e.id = l.id
        ORDER BY ${sql.raw(orderBy)}
        OFFSET ${off}
        LIMIT ${lim}
      `);

      const listings = (listRes as any).rows as Array<{
        id: number; title: string; description: string | null; price_per_night: string;
        city: string; country: string; beds: number; baths: number; is_instant_book: boolean;
      }>;

      // photos for page
      const ids = listings.map(l => l.id);
      const photosByListing: Record<number, Array<{ url: string; alt: string | null }>> = {};
      if (ids.length) {
        const photosRes = await db.execute(sql`
          SELECT listing_id, url, alt
          FROM photos
          WHERE listing_id IN (${sql.join(ids, sql`, `)})
          ORDER BY id ASC
        `);
        for (const row of (photosRes as any).rows as Array<{ listing_id: number; url: string; alt: string | null }>) {
          (photosByListing[row.listing_id] ??= []).push({ url: row.url, alt: row.alt });
        }
      }

      return res.json({
        data: listings.map(l => ({ ...l, photos: photosByListing[l.id] ?? [] })),
        page: { total, offset: off, limit: lim, hasMore: off + listings.length < total },
      });
    }

    // -------- Without date range: original path --------
    const totalRes = await db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM listings l
      WHERE ${baseWhere}
    `);
    const total: number = (totalRes as any).rows?.[0]?.total ?? 0;

    const listRes = await db.execute(sql`
      SELECT
        l.id, l.title, l.description, l.price_per_night, l.city, l.country, l.beds, l.baths, l.is_instant_book
      FROM listings l
      WHERE ${baseWhere}
      ORDER BY ${sql.raw(orderBy)}
      OFFSET ${off}
      LIMIT ${lim}
    `);

    const listings = (listRes as any).rows as Array<{
      id: number; title: string; description: string | null; price_per_night: string;
      city: string; country: string; beds: number; baths: number; is_instant_book: boolean;
    }>;

    const ids = listings.map(l => l.id);
    const photosByListing: Record<number, Array<{ url: string; alt: string | null }>> = {};
    if (ids.length) {
      const photosRes = await db.execute(sql`
        SELECT listing_id, url, alt
        FROM photos
        WHERE listing_id IN (${sql.join(ids, sql`, `)})
        ORDER BY id ASC
      `);
      for (const row of (photosRes as any).rows as Array<{ listing_id: number; url: string; alt: string | null }>) {
        (photosByListing[row.listing_id] ??= []).push({ url: row.url, alt: row.alt });
      }
    }

    return res.json({
      data: listings.map(l => ({ ...l, photos: photosByListing[l.id] ?? [] })),
      page: { total, offset: off, limit: lim, hasMore: off + listings.length < total },
    });
  } catch (e) {
    console.error('[public.listings] error', e);
    return res.status(500).json({ error: 'Failed to load listings' });
  }
});

// ---- Listings search (date+guests) — collision-free test endpoint -----------
// GET /api/listings/search?start=YYYY-MM-DD&end=YYYY-MM-DD&guests=2&city=&min=&max=&instant=&limit=&offset=&sort=
app.get('/api/listings/search', async (req, res) => {
  const { city, min, max, instant, limit, offset, sort, start, end, guests } =
    req.query as Record<string, string | undefined>;

  const SORT_MAP: Record<string, string> = {
    price_asc: 'l.price_per_night ASC',
    price_desc: 'l.price_per_night DESC',
    newest: 'l.id DESC',
  };
  const orderBy = SORT_MAP[sort ?? ''] ?? 'l.id ASC';

  const ALLOWED_LIMITS = new Set([8, 12, 24, 48]);
  const DEFAULT_LIMIT = 8;
  const MIN_PRICE = 0;
  const MAX_PRICE = 100_000;

  let limParsed = Number(limit);
  if (!Number.isFinite(limParsed)) limParsed = DEFAULT_LIMIT;
  const lim = ALLOWED_LIMITS.has(limParsed) ? limParsed : DEFAULT_LIMIT;

  const minParsed = Number(min);
  const maxParsed = Number(max);
  let minRM = Number.isFinite(minParsed) ? Math.max(minParsed, MIN_PRICE) : MIN_PRICE;
  let maxRM = Number.isFinite(maxParsed) ? Math.min(maxParsed, MAX_PRICE) : MAX_PRICE;
  if (minRM > maxRM) [minRM, maxRM] = [maxRM, minRM];

  const offParsed = Number(offset);
  const off = Number.isFinite(offParsed) ? Math.max(Math.trunc(offParsed), 0) : 0;

  const isInstant = instant === 'true' || instant === '1';
  const cityRaw = (city ?? '').trim();
  const cityKey = cityRaw.replace(/\s+/g, '');

  const isYmd = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const startStr = start?.trim();
  const endStr = end?.trim();
  const useDate = isYmd(startStr) && isYmd(endStr);

  const guestsNum = Number(guests);
  const needGuests = Number.isFinite(guestsNum) ? Math.max(1, Math.trunc(guestsNum)) : undefined;

  // base WHERE for listings
  const baseWhere = sql`
    l.published = true
    ${cityKey ? sql` AND REPLACE(l.city, ' ', '') ILIKE ${'%' + cityKey + '%'} ` : sql``}
    AND (l.price_per_night)::numeric BETWEEN ${minRM} AND ${maxRM}
    ${isInstant ? sql` AND l.is_instant_book = true ` : sql``}
  `;

  try {
    if (!useDate) {
      // fallback to original logic if no dates provided
      const totalRes = await db.execute(sql`
        SELECT COUNT(*)::int AS total FROM listings l WHERE ${baseWhere}
      `);
      const total: number = (totalRes as any).rows?.[0]?.total ?? 0;

      const listRes = await db.execute(sql`
        SELECT
          l.id, l.title, l.description, l.price_per_night, l.city, l.country, l.beds, l.baths, l.is_instant_book
        FROM listings l
        WHERE ${baseWhere}
        ORDER BY ${sql.raw(orderBy)}
        OFFSET ${off}
        LIMIT ${lim}
      `);
      const listings = (listRes as any).rows as any[];

      // photos
      const ids = listings.map(l => l.id);
      const photosByListing: Record<number, Array<{ url: string; alt: string | null }>> = {};
      if (ids.length) {
        const photosRes = await db.execute(sql`
          SELECT listing_id, url, alt
          FROM photos
          WHERE listing_id IN (${sql.join(ids, sql`, `)})
          ORDER BY id ASC
        `);
        for (const row of (photosRes as any).rows as Array<{ listing_id: number; url: string; alt: string | null }>) {
          (photosByListing[row.listing_id] ??= []).push({ url: row.url, alt: row.alt });
        }
      }

      return res.json({
        data: listings.map(l => ({ ...l, photos: photosByListing[l.id] ?? [] })),
        page: { total, offset: off, limit: lim, hasMore: off + listings.length < total },
      });
    }

    // Date range filter (NOT EXISTS anti-join)
    if ((startStr as string) > (endStr as string)) {
      return res.status(400).json({ error: 'start must be <= end' });
    }
    const capCheck = needGuests ? sql` OR a.guests < ${needGuests} ` : sql``;

    // total
    const totalRes = await db.execute(sql`
      WITH days AS (
        SELECT generate_series(${startStr}::date, ${endStr}::date, '1 day')::date AS "day"
      )
      SELECT COUNT(*)::int AS total
      FROM listings l
      WHERE ${baseWhere}
        AND NOT EXISTS (
          SELECT 1
          FROM days d
          LEFT JOIN availability a
            ON a.listing_id = l.id
           AND a."day" = d."day"
          WHERE a."day" IS NULL
             OR a.is_available = FALSE
             ${capCheck}
        )
    `);
    const total: number = (totalRes as any).rows?.[0]?.total ?? 0;

    // page
    const listRes = await db.execute(sql`
      WITH days AS (
        SELECT generate_series(${startStr}::date, ${endStr}::date, '1 day')::date AS "day"
      )
      SELECT
        l.id, l.title, l.description, l.price_per_night, l.city, l.country, l.beds, l.baths, l.is_instant_book
      FROM listings l
      WHERE ${baseWhere}
        AND NOT EXISTS (
          SELECT 1
          FROM days d
          LEFT JOIN availability a
            ON a.listing_id = l.id
           AND a."day" = d."day"
          WHERE a."day" IS NULL
             OR a.is_available = FALSE
             ${capCheck}
        )
      ORDER BY ${sql.raw(orderBy)}
      OFFSET ${off}
      LIMIT ${lim}
    `);

    const listings = (listRes as any).rows as any[];

    // photos
    const ids = listings.map(l => l.id);
    const photosByListing: Record<number, Array<{ url: string; alt: string | null }>> = {};
    if (ids.length) {
      const photosRes = await db.execute(sql`
        SELECT listing_id, url, alt
        FROM photos
        WHERE listing_id IN (${sql.join(ids, sql`, `)})
        ORDER BY id ASC
      `);
      for (const row of (photosRes as any).rows as Array<{ listing_id: number; url: string; alt: string | null }>) {
        (photosByListing[row.listing_id] ??= []).push({ url: row.url, alt: row.alt });
      }
    }

    return res.json({
      data: listings.map(l => ({ ...l, photos: photosByListing[l.id] ?? [] })),
      page: { total, offset: off, limit: lim, hasMore: off + listings.length < total },
    });
  } catch (e) {
    console.error('[public.listings/search] error', e);
    return res.status(500).json({ error: 'Failed to load listings (search)' });
  }
});

// ---- Listing details --------------------------------------------------------
// GET /api/listings/:id
app.get('/api/listings/:id', async (req, res) => {
  const raw = req.params.id;
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  try {
    // Basic fields
    const rowRes = await db.execute(sql`
      SELECT
        id, title, description, price_per_night, city, country, beds, baths, is_instant_book
      FROM listings
      WHERE id = ${id}
      LIMIT 1
    `);

    const row = (rowRes as any).rows?.[0];
    if (!row) return res.status(404).json({ error: 'Not found' });

    // Photos
    const photosRes = await db.execute(sql`
      SELECT url, alt
      FROM photos
      WHERE listing_id = ${id}
      ORDER BY id ASC
    `);

    const photos = ((photosRes as any).rows ?? []).map(
      (p: { url: string; alt: string | null }) => ({ url: p.url, alt: p.alt })
    );

    return res.json({ ...row, photos });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to fetch listing' });
  }
});

// ⛳ ANCHOR: PENDING-SWEEPER (unified: expires_at OR created_at+hold)
function startPendingSweeper() {
  // Clamp between 5–120 minutes just in case
  const holdMins = Math.max(5, Math.min(120, Number(process.env.BOOKING_HOLD_MINUTES || 30)));
  const everyMs  = Number(process.env.PENDING_SWEEP_INTERVAL_MS || 60_000); // 1m

  async function sweepOnce() {
    try {
      await db.execute(sql`
        UPDATE bookings
        SET status = 'expired'
        WHERE status = 'pending'
          AND created_at < NOW() - (${holdMins}::text || ' minutes')::interval
      `);
    } catch (e: any) {
      console.error("[pending-sweeper] err:", e?.message, e?.code ?? "", e);
    }

  }


  sweepOnce();                 // kick immediately
  setInterval(sweepOnce, everyMs);
}


// Boot
app.listen(ServerConfig.PORT, "0.0.0.0", () => {
  console.log(`API on http://localhost:${ServerConfig.PORT}`);
  console.log('Routes: GET /health, GET /api/cities, GET /api/listings, GET /api/listings/:id');
  startPendingSweeper(); // ✅ start after server is live
});

