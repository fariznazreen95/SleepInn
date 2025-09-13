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
// GET /api/listings?city=&min=&max=&instant=true&limit=24
// - price_per_night is TEXT in DB → CAST to INT for numeric filters
// - city filter is "space-insensitive": 'georgetown' matches 'George Town'
app.get('/api/listings', async (req, res) => {
  const { city, min, max, instant, limit } = req.query as Record<string, string | undefined>;

  const DEFAULT_LIMIT = 24;
  const MAX_LIMIT = 50;
  const MIN_PRICE = 0;
  const MAX_PRICE = 100_000;

  const lim = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);

  const minParsed = Number(min);
  const maxParsed = Number(max);
  let minRM = Number.isFinite(minParsed) ? Math.max(minParsed, MIN_PRICE) : MIN_PRICE;
  let maxRM = Number.isFinite(maxParsed) ? Math.min(maxParsed, MAX_PRICE) : MAX_PRICE;
  if (minRM > maxRM) [minRM, maxRM] = [maxRM, minRM];

  // space-insensitive city match:
  // compare replace(lower(l.city),' ','') LIKE %replace(lower(:city),' ','')%
  const cityNorm = typeof city === 'string' && city.trim()
    ? city.trim().toLowerCase().replace(/\s+/g, '')
    : null;
  const cityFilter = cityNorm
    ? sql`AND REPLACE(LOWER(l.city), ' ', '') LIKE ${'%' + cityNorm + '%'}`
    : sql``;

  const instantFilter =
    typeof instant === 'string'
      ? sql`AND l.is_instant_book = ${instant.toLowerCase() === 'true'}`
      : sql``;

  try {
    const rows = await db.execute(sql`
      SELECT
        l.*,
        COALESCE(
          json_agg(json_build_object('url', p.url, 'alt', p.alt) ORDER BY p.id)
            FILTER (WHERE p.id IS NOT NULL),
          '[]'
        ) AS photos
      FROM listings l
      LEFT JOIN photos p ON p.listing_id = l.id
      WHERE 1=1
        ${cityFilter}
        ${instantFilter}
        AND CAST(l.price_per_night AS INT) BETWEEN ${minRM} AND ${maxRM}
      GROUP BY l.id
      ORDER BY l.created_at DESC
      LIMIT ${lim}
    `);

    res.json(rows.rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch listings' });
  }
});

// ---- Listing details ---------------------------------------------------------
app.get('/api/listings/:id', async (req, res) => {
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum)) return res.status(400).json({ error: 'invalid_id' });

  try {
    const result = await db.execute(sql`
      SELECT
        l.*,
        COALESCE(
          json_agg(json_build_object('url', p.url, 'alt', p.alt) ORDER BY p.id)
            FILTER (WHERE p.id IS NOT NULL),
          '[]'
        ) AS photos
      FROM listings l
      LEFT JOIN photos p ON p.listing_id = l.id
      WHERE l.id = ${idNum}
      GROUP BY l.id
      LIMIT 1
    `);

    if (result.rowCount === 0) return res.status(404).json({ error: 'not_found' });
    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch listing' });
  }
});

// Boot
app.listen(ServerConfig.PORT, () => {
  console.log(`API on http://localhost:${ServerConfig.PORT}`);
  console.log('Routes: GET /health, GET /api/cities, GET /api/listings, GET /api/listings/:id');
});
