# SleepInn API (server)
- Port: reads `PORT` from `.env`, defaults to `5174`.
- Endpoints:
  - GET /health → `{ ok: true }` when DB reachable
  - GET /api/listings?city=&min=&max=&instant=true&limit=24 → array of listings (snake_case)
  - GET /api/listings/:id → one listing object with `photos[]`

## Scripts
- `npm run dev` — start API with tsx watch
- `npm run seed` — wipe + seed 12 listings
- `npm run migrate` — apply drizzle migrations
- `npm run generate` — generate drizzle migrations

## Env
- Create `.env` with `DATABASE_URL=...` (Neon/PG) and optional `PORT=5174`.

