// server/src/index.ts
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

// Feature routers
import hostListings from "./routes/hostListings";
import hostBookings from "./routes/hostBookings";
import photos from "./routes/photos";

// If you have these, keep them imported+mounted too:
// import auth from "./routes/auth";
// import listings from "./routes/listings";
// import stripe from "./routes/stripe";
// import pricing from "./routes/pricing";

const app = express();

/* ----------------------------- Middleware ----------------------------- */
const WEB_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  process.env.PUBLIC_URL || "", // harmless if empty
].filter(Boolean);

app.use(
  cors({
    origin: WEB_ORIGINS,
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "5mb" }));

/* ------------------------------- Routes -------------------------------- */
// Public/health (optional but handy)
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Auth, search/browse, pricing, stripe, etc. (uncomment if present)
// app.use("/api/auth", auth);
// app.use("/api", listings);
// app.use("/api/stripe", stripe);
// app.use("/api", pricing);

// Host area
app.use("/api/host", hostListings);   // /api/host/listings, /:id, /:id/publish
app.use("/api/host", hostBookings);   // /api/host/bookings

// Photos (both nested + flat)
app.use("/api/host", photos);         // /api/host/listings/:id/photos/confirm
app.use("/api", photos);              // /api/photos/presign (and legacy /photos/upload if any)

/* --------------------------- Error handling --------------------------- */
app.use((err: any, _req, res, _next) => {
  console.error("[unhandled]", err);
  res.status(500).json({ error: "Internal Server Error" });
});

export default app;
