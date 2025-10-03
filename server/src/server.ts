import { devGuardHeaders, SERVER_VERSION } from "./devGuard";
import express from "express";
import cors from "cors";
import { ServerConfig } from "./serverConfig";
import { db } from "./db";
import { sql } from "drizzle-orm";
import cookieParser from "cookie-parser";

// routes/middleware
import authRoutes from "./routes/auth";
import meRoute from "./routes/me";
import requireAuth from "./middleware/requireAuth";
import hostListingsRouter from "./routes/hostListings";
import photos from "./routes/photos";
import changePassword from "./routes/changePassword";
import availability from "./routes/availability";
import pricing from "./routes/pricing";
import bookings from "./routes/bookings";
import stripeRoutes from "./routes/stripe";
import stripeWebhook from "./webhooks/stripeWebhook";
import hostBookings from "./routes/hostBookings";

const app = express();

/* ────────────────── Boot banner ────────────────── */
console.log(
  `[boot] server.ts starting (pid=${process.pid}) NODE_ENV=${
    process.env.NODE_ENV ?? "undefined"
  }`
);

/* tiny helper to list routes */
function dumpRoutes() {
  const seen: string[] = [];
  // @ts-ignore access router internals for debug only
  (app._router?.stack ?? []).forEach((l: any) => {
    if (l?.route?.path) {
      const m =
        Object.keys(l.route.methods ?? {}).join(",").toUpperCase() || "USE";
      seen.push(`${m.padEnd(6)} ${l.route.path}`);
    } else if (l?.name === "router" && l?.handle?.stack) {
      l.handle.stack.forEach((r: any) => {
        if (r?.route?.path) {
          const m =
            Object.keys(r.route.methods ?? {}).join(",").toUpperCase() || "USE";
          seen.push(`${m.padEnd(6)} ${r.route.path}`);
        }
      });
    }
  });
  console.log("[routes]", seen.length ? `\n  - ${seen.join("\n  - ")}` : "(none)");
}

/* ────────────────── Middleware ────────────────── */
app.use(devGuardHeaders);

app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Stripe webhook must be BEFORE express.json()
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhook
);

app.use(express.json());
app.use(cookieParser());

/* ────────────────── Public/utility routes ────────────────── */

// Health (DB check)
app.get("/api/health", async (_req, res) => {
  try {
    await db.execute(sql`select 1 as ok`);
    res
      .setHeader("Cache-Control", "no-store")
      .setHeader("X-Server-Version", SERVER_VERSION)
      .json({
        ok: true,
        service: "sleepinn-api",
        version: SERVER_VERSION,
        pid: process.pid,
      });
  } catch {
    res.status(500).json({ ok: false, error: "db_unreachable" });
  }
});

// Also accept /health
app.get("/health", (_req, res) => {
  res
    .setHeader("Cache-Control", "no-store")
    .setHeader("X-Server-Version", SERVER_VERSION)
    .json({
      ok: true,
      service: "sleepinn-api",
      version: SERVER_VERSION,
      pid: process.pid,
    });
});

/* ────────────────── Feature routers ────────────────── */

// Auth / account
app.use("/api/auth", authRoutes);
app.use("/api", meRoute);
app.use("/api/change-password", changePassword);

// Availability + pricing
app.use("/api", availability);
app.use("/api", pricing);

// Host area
app.use("/api/host", hostListingsRouter); // /api/host/listings... etc
app.use("/api/host", hostBookings);       // /api/host/bookings

// 🔧 Photos (this is the important fix)
// The photos router defines paths like `/:id/photos/confirm`,
// so it MUST be mounted at `/api/host/listings` to produce
// `/api/host/listings/:id/photos/confirm`.
app.use("/api/host/listings", photos);

// Also expose flat photos endpoints (e.g. /api/photos/presign)
app.use("/api/host", photos);
app.use("/api/photos", photos);

// Bookings (guest-side)
app.use("/api/bookings", bookings);

// Stripe
app.use("/api/stripe", stripeRoutes);

// Quick protected test route
app.get("/api/protected", requireAuth(), (req, res) => {
  res.json({ ok: true, user: req.user });
});

/* ────────────────── Public browse/search endpoints ────────────────── */

// Cities
app.get("/api/cities", async (_req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT DISTINCT city FROM listings
      WHERE city IS NOT NULL AND city <> ''
      ORDER BY city ASC
    `);
    res.json(rows.rows.map((r: { city: string }) => r.city));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch cities" });
  }
});

// Listings (filters; optionally date+guests)
app.get("/api/listings", async (req, res) => {
  const { city, min, max, instant, limit, offset, sort, start, end, guests } =
    req.query as Record<string, string | undefined>;

  const SORT_MAP: Record<string, string> = {
    price_asc: "l.price_per_night ASC",
    price_desc: "l.price_per_night DESC",
    newest: "l.id DESC",
  };
  const orderBy = SORT_MAP[sort ?? ""] ?? "l.id ASC";

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

  const isInstant = instant === "true" || instant === "1";
  const cityRaw = (city ?? "").trim();
  const cityKey = cityRaw.replace(/\s+/g, "");

  const isYmd = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const startStr = start?.trim();
  const endStr = end?.trim();
  const useDate = isYmd(startStr) && isYmd(endStr);

  const guestsNum = Number(guests);
  const needGuests = Number.isFinite(guestsNum)
    ? Math.max(1, Math.trunc(guestsNum))
    : undefined;

  const baseWhere = sql`
    l.published = true
    ${cityKey ? sql` AND REPLACE(l.city, ' ', '') ILIKE ${"%" + cityKey + "%"}` : sql``}
    AND (l.price_per_night)::numeric BETWEEN ${minRM} AND ${maxRM}
    ${isInstant ? sql` AND l.is_instant_book = true ` : sql``}
  `;

  try {
    if (useDate) {
      if ((startStr as string) > (endStr as string)) {
        return res.status(400).json({ error: "start must be <= end" });
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

      // photos for page
      const ids = listings.map((l) => l.id);
      const photosByListing: Record<number, Array<{ url: string; alt: string | null }>> = {};
      if (ids.length) {
        const photosRes = await db.execute(sql`
          SELECT listing_id, url, alt
          FROM photos
          WHERE listing_id IN (${sql.join(ids, sql`, `)})
          ORDER BY id ASC
        `);
        for (const row of (photosRes as any).rows as Array<{
          listing_id: number;
          url: string;
          alt: string | null;
        }>) {
          (photosByListing[row.listing_id] ??= []).push({
            url: row.url,
            alt: row.alt,
          });
        }
      }

      return res.json({
        data: listings.map((l) => ({ ...l, photos: photosByListing[l.id] ?? [] })),
        page: { total, offset: off, limit: lim, hasMore: off + listings.length < total },
      });
    }

    // Without dates
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

    const ids = listings.map((l) => l.id);
    const photosByListing: Record<number, Array<{ url: string; alt: string | null }>> = {};
    if (ids.length) {
      const photosRes = await db.execute(sql`
        SELECT listing_id, url, alt
        FROM photos
        WHERE listing_id IN (${sql.join(ids, sql`, `)})
        ORDER BY id ASC
      `);
      for (const row of (photosRes as any).rows as Array<{
        listing_id: number;
        url: string;
        alt: string | null;
      }>) {
        (photosByListing[row.listing_id] ??= []).push({ url: row.url, alt: row.alt });
      }
    }

    return res.json({
      data: listings.map((l) => ({ ...l, photos: photosByListing[l.id] ?? [] })),
      page: { total, offset: off, limit: lim, hasMore: off + listings.length < total },
    });
  } catch (e) {
    console.error("[public.listings] error", e);
    return res.status(500).json({ error: "Failed to load listings" });
  }
});

// Listings search (date+guests) — alt endpoint
app.get("/api/listings/search", async (req, res) => {
  const { city, min, max, instant, limit, offset, sort, start, end, guests } =
    req.query as Record<string, string | undefined>;

  const SORT_MAP: Record<string, string> = {
    price_asc: "l.price_per_night ASC",
    price_desc: "l.price_per_night DESC",
    newest: "l.id DESC",
  };
  const orderBy = SORT_MAP[sort ?? ""] ?? "l.id ASC";

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

  const isInstant = instant === "true" || instant === "1";
  const cityRaw = (city ?? "").trim();
  const cityKey = cityRaw.replace(/\s+/g, "");

  const isYmd = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const startStr = start?.trim();
  const endStr = end?.trim();
  const useDate = isYmd(startStr) && isYmd(endStr);

  const guestsNum = Number(guests);
  const needGuests = Number.isFinite(guestsNum)
    ? Math.max(1, Math.trunc(guestsNum))
    : undefined;

  const baseWhere = sql`
    l.published = true
    ${cityKey ? sql` AND REPLACE(l.city, ' ', '') ILIKE ${"%" + cityKey + "%"}` : sql``}
    AND (l.price_per_night)::numeric BETWEEN ${minRM} AND ${maxRM}
    ${isInstant ? sql` AND l.is_instant_book = true ` : sql``}
  `;

  try {
    if (!useDate) {
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

      const ids = listings.map((l) => l.id);
      const photosByListing: Record<number, Array<{ url: string; alt: string | null }>> = {};
      if (ids.length) {
        const photosRes = await db.execute(sql`
          SELECT listing_id, url, alt
          FROM photos
          WHERE listing_id IN (${sql.join(ids, sql`, `)})
          ORDER BY id ASC
        `);
        for (const row of (photosRes as any).rows as Array<{
          listing_id: number;
          url: string;
          alt: string | null;
        }>) {
          (photosByListing[row.listing_id] ??= []).push({ url: row.url, alt: row.alt });
        }
      }

      return res.json({
        data: listings.map((l) => ({ ...l, photos: photosByListing[l.id] ?? [] })),
        page: { total, offset: off, limit: lim, hasMore: off + listings.length < total },
      });
    }

    if ((startStr as string) > (endStr as string)) {
      return res.status(400).json({ error: "start must be <= end" });
    }
    const capCheck = needGuests ? sql` OR a.guests < ${needGuests} ` : sql``;

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

    const ids = listings.map((l) => l.id);
    const photosByListing: Record<number, Array<{ url: string; alt: string | null }>> = {};
    if (ids.length) {
      const photosRes = await db.execute(sql`
        SELECT listing_id, url, alt
        FROM photos
        WHERE listing_id IN (${sql.join(ids, sql`, `)})
        ORDER BY id ASC
      `);
      for (const row of (photosRes as any).rows as Array<{
        listing_id: number;
        url: string;
        alt: string | null;
      }>) {
        (photosByListing[row.listing_id] ??= []).push({ url: row.url, alt: row.alt });
      }
    }

    return res.json({
      data: listings.map((l) => ({ ...l, photos: photosByListing[l.id] ?? [] })),
      page: { total, offset: off, limit: lim, hasMore: off + listings.length < total },
    });
  } catch (e) {
    console.error("[public.listings/search] error", e);
    return res.status(500).json({ error: "Failed to load listings (search)" });
  }
});

// Listing details
app.get("/api/listings/:id", async (req, res) => {
  const raw = req.params.id;
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid id" });
  }

  try {
    const rowRes = await db.execute(sql`
      SELECT
        id, title, description, price_per_night, city, country, beds, baths, is_instant_book
      FROM listings
      WHERE id = ${id}
      LIMIT 1
    `);

    const row = (rowRes as any).rows?.[0];
    if (!row) return res.status(404).json({ error: "Not found" });

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
    return res.status(500).json({ error: "Failed to fetch listing" });
  }
});

/* ────────────────── Pending sweeper ────────────────── */
function startPendingSweeper() {
  const holdMins = Math.max(5, Math.min(120, Number(process.env.BOOKING_HOLD_MINUTES || 30)));
  const everyMs = Number(process.env.PENDING_SWEEP_INTERVAL_MS || 60_000);

  async function sweepOnce() {
    try {
      await db.execute(sql`
        UPDATE bookings
        SET status = 'expired'
        WHERE status = 'pending'
          AND COALESCE(
                expires_at,
                created_at + (${holdMins}::text || ' minutes')::interval
              ) < NOW()
      `);
    } catch (e: any) {
      if (e?.code === "42703" || e?.code === "42P01") return;
      console.error("[pending-sweeper] err:", e?.message, e?.code ?? "", e);
    }
  }

  sweepOnce();
  setInterval(sweepOnce, everyMs);
}

/* ────────────────── After all mounts ────────────────── */
dumpRoutes();

/* ────────────────── Single 404 trap (Express 5 safe) ────────────────── */
app.use((req, res) => {
  console.warn(`[404] ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: "not_found", path: req.originalUrl });
});

/* ────────────────── Boot ────────────────── */
app.listen(ServerConfig.PORT, "0.0.0.0", () => {
  console.log(`API on http://localhost:${ServerConfig.PORT}`);
  console.log(
    "Routes: GET /api/health, GET /api/cities, GET /api/listings, GET /api/listings/:id"
  );
  if (process.env.ENABLE_SWEEPER === "1") startPendingSweeper();
});
