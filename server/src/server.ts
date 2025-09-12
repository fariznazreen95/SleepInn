import express from 'express';
import cors from 'cors';
import { ServerConfig } from './serverConfig';
import { db } from './db';
import { sql } from 'drizzle-orm';

const app = express();
app.use(cors());
app.use(express.json());

// Health: also checks DB briefly
app.get('/health', async (_req, res) => {
  try {
    await db.execute(sql`select 1 as ok`);
    res.json({ ok: true, service: 'sleepinn-api' });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'db_unreachable' });
  }
});

// Listings
app.get('/api/listings', async (_req, res) => {
  const rows = await db.execute(sql`
    select l.*,
      coalesce(json_agg(json_build_object('url', p.url, 'alt', p.alt))
        filter (where p.id is not null), '[]') as photos
    from listings l
    left join photos p on p.listing_id = l.id
    group by l.id
    order by l.created_at desc
    limit 30
  `);
  res.json(rows.rows);
});

// No manual connect; pool handles it
app.listen(ServerConfig.PORT, () => {
  console.log(`API on http://localhost:${ServerConfig.PORT}`);
  console.log('Routes: GET /health, GET /api/listings');
});
