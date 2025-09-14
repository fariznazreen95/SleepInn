import express from 'express';
import cors from 'cors';
import { ServerConfig } from './serverConfig';
import { db } from './db';
import { sql } from 'drizzle-orm';

const app = express();
app.use(cors());
app.use(express.json());

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
    res.json(rows.rows.map(r => r.city));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch cities' });
  }
});

// ---- Listings with filters ---------------------------------------------------
// GET /api/listings?city=&min=&max=&instant=true&limit=24&offset=0
// - price_per_night is TEXT in DB → CAST to NUMERIC for numeric filters
// - city filter is "space-insensitive": 'georgetown' matches 'George Town'
app.get('/api/listings', async (req, res) => {
  const { city, min, max, instant, limit, offset } =
    req.query as Record<string, string | undefined>;

  const DEFAULT_LIMIT = 24;
  const MAX_LIMIT = 50;
  const MIN_PRICE = 0;
  const MAX_PRICE = 100_000;

  // limit
  const lim = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);

  // price range
  const minParsed = Number(min);
  const maxParsed = Number(max);
  let minRM = Number.isFinite(minParsed) ? Math.max(minParsed, MIN_PRICE) : MIN_PRICE;
  let maxRM = Number.isFinite(maxParsed) ? Math.min(maxParsed, MAX_PRICE) : MAX_PRICE;
  if (minRM > maxRM) [minRM, maxRM] = [maxRM, minRM];

  // paging
  const offParsed = Number(offset);
  const off = Number.isFinite(offParsed) ? Math.max(Math.trunc(offParsed), 0) : 0;

  // flags / normalized inputs
  const isInstant = (instant === 'true' || instant === '1');
  const cityRaw = (city ?? '').trim();
  const cityKey = cityRaw.replace(/\s+/g, ''); // "George Town" → "GeorgeTown"

  // WHERE fragment (space-insensitive city, price range, instant)
  const whereFrag = sql`
    ${cityKey ? sql` AND REPLACE(city, ' ', '') ILIKE ${'%' + cityKey + '%'} ` : sql``}
    AND (price_per_night)::numeric BETWEEN ${minRM} AND ${maxRM}
    ${isInstant ? sql` AND is_instant_book = true ` : sql``}
  `;

  // 1) COUNT(*) with same filters (no photos join)
  const totalRes = await db.execute(sql`
    SELECT COUNT(*)::int AS total
    FROM listings
    WHERE 1=1
    ${whereFrag}
  `);
  const total: number = (totalRes as any).rows?.[0]?.total ?? 0;

  // 2) Page of listings (no photos yet)
  const listRes = await db.execute(sql`
    SELECT
      id, title, description, price_per_night, city, country, beds, baths, is_instant_book
    FROM listings
    WHERE 1=1
    ${whereFrag}
    ORDER BY id DESC
    OFFSET ${off}
    LIMIT ${lim}
  `);
  const listings = (listRes as any).rows as Array<{
    id: number;
    title: string;
    description: string | null;
    price_per_night: string;
    city: string;
    country: string;
    beds: number;
    baths: number;
    is_instant_book: boolean;
  }>;

  // 3) Photos for this page only
  const ids = listings.map(l => l.id);
  const photosByListing: Record<number, Array<{ url: string; alt: string | null }>> = {};

  if (ids.length > 0) {
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

  // 4) Attach photos[] and return envelope
  const data = listings.map(l => ({
    ...l,
    photos: photosByListing[l.id] ?? [],
  }));

  return res.json({
    data,
    page: {
      total,
      offset: off,
      limit: lim,
      hasMore: off + data.length < total,
    },
  });
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


// Boot
app.listen(ServerConfig.PORT, () => {
  console.log(`API on http://localhost:${ServerConfig.PORT}`);
  console.log('Routes: GET /health, GET /api/cities, GET /api/listings, GET /api/listings/:id');
});
