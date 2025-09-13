# SleepInn Web (Vite React)
- API base: from `.env` → `VITE_API_URL`, default project uses `http://localhost:5174`.

## Scripts
- `npm run dev` — starts Vite (http://localhost:5173)
- `npm run build` — typecheck + build
- `npm run preview` — serve build

## Dev flow
1) Run API first: `cd ../server && npm run dev`
2) Run web: `cd ../web && npm run dev`
3) Filters: city / min / max / instant
4) Click any card to open details panel
