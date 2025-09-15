import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";



type Photo = { url: string; alt: string | null };
type Listing = {
  id: number;
  title: string;
  description: string | null;
  price_per_night: string;
  city: string;
  country: string;
  beds: number;
  baths: number;
  is_instant_book: boolean;
  photos: Photo[];
};

const API = import.meta.env.VITE_API_URL ?? "http://localhost:5174";

// Theme palette (midnight blue + gold)
const COLORS = {
  bg: "#0b1220",
  panel: "#0e2033",
  card: "#10263d",
  border: "#1c3b5a",
  text: "#e9edf5",
  sub: "rgba(233,237,245,0.75)",
  gold: "#f4c430",
  goldDark: "#caa50a",
};

export default function App() {
  // filters
  const [city, setCity] = useState("");
  const [min, setMin] = useState<string>("");
  const [max, setMax] = useState<string>("");
  const [instant, setInstant] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();


  // paging derived from URL (default 8, not 24)
  const limitFromUrl = searchParams.get("limit");
  const limit = Math.min(50, Math.max(1, Number(limitFromUrl ?? "8")));
  const page  = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const offset = (page - 1) * limit;

  // If no `limit` in URL, set default 8 once on mount
  useEffect(() => {
    if (!limitFromUrl) {
      const next = new URLSearchParams(searchParams);
      next.set("limit", String(limit)); // 8 by default
      next.set("page", "1");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);


  // READ: whenever the URL changes (refresh/back/forward), load filters into state
  useEffect(() => {
    const qCity = searchParams.get("city") ?? "";
    const qMin  = searchParams.get("min")  ?? "";
    const qMax  = searchParams.get("max")  ?? "";
    const qInst = searchParams.get("instant"); // "true"/"1" => true

    const nextInstant = qInst === "true" || qInst === "1";

    // only update when different (prevents unnecessary re-renders)
    if (qCity !== city) setCity(qCity);
    if (qMin  !== min)  setMin(qMin);
    if (qMax  !== max)  setMax(qMax);
    if (nextInstant !== instant) setInstant(nextInstant);

    // we intentionally depend only on searchParams to avoid loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // WRITE: when filters change, update the URL (debounced). Reset page=1 on filter change.
  useEffect(() => {
    const t = setTimeout(() => {
      const prevLimit = searchParams.get("limit");
      const sanitizedLimit = String(Math.min(50, Math.max(1, Number(prevLimit ?? "8"))));
  
      const prev = {
        city:    searchParams.get("city") ?? "",
        min:     searchParams.get("min")  ?? "",
        max:     searchParams.get("max")  ?? "",
        instant: searchParams.get("instant") ?? "",
        limit:   sanitizedLimit,
        page:    searchParams.get("page") ?? "",
      };
  
      const target = {
        city: city.trim(),
        min:  min.trim() ? String(Number(min)) : "",
        max:  max.trim() ? String(Number(max)) : "",
        instant: instant ? "true" : "",
        limit: sanitizedLimit,          // ✅ keep existing limit
        page:  prev.page || "1",
      };
  
      const filtersChanged =
        prev.city    !== target.city ||
        prev.min     !== target.min  ||
        prev.max     !== target.max  ||
        prev.instant !== target.instant;
  
      if (filtersChanged) target.page = "1";
  
      const next = new URLSearchParams();
      if (target.city)    next.set("city", target.city);
      if (target.min)     next.set("min", target.min);
      if (target.max)     next.set("max", target.max);
      if (target.instant) next.set("instant", target.instant);
      if (target.limit)   next.set("limit", target.limit);
      if (target.page)    next.set("page", target.page);

      // keep current sort in the URL (so our writer doesn’t wipe it out)
      const currSort = searchParams.get("sort");
      if (currSort) next.set("sort", currSort);
  
      const currStr = searchParams.toString();
      const nextStr = next.toString();
      if (currStr !== nextStr) setSearchParams(next, { replace: true });
    }, 300);

    return () => clearTimeout(t);
    // IMPORTANT: keep deps like this—URL is the source of truth here   // eslint-disable-next-line react-hooks/exhaustive-deps


    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, min, max, instant, searchParams, setSearchParams]);

  // data
  const [items, setItems] = useState<Listing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pageInfo, setPageInfo] = useState<{
    total: number; offset: number; limit: number; hasMore: boolean
  } | null>(null);

  // splash control (first load only)
  const [firstLoadComplete, setFirstLoadComplete] = useState(false);
  const [minDelayDone, setMinDelayDone] = useState(false); // ~0.8s minimum splash
  const [splashFade, setSplashFade] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  // sound (file first, synth fallback). No UI button; best-effort autoplay.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playedOnce = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setMinDelayDone(true), 800);
    return () => clearTimeout(t);
  }, []);

  // Try to play chime (mp3 first; if not available or blocked, synth ding–dong)
async function tryPlayChime(): Promise<void> {
  if (playedOnce.current) return;

  // 1) File-based chime if present
  const el = audioRef.current;
  if (el) {
    try {
      el.pause();
      el.currentTime = 0;
      el.load();            // refresh buffer (helps in Vite dev)
      el.volume = 0.45;
      await el.play();      // will work after first user gesture
      playedOnce.current = true;
      return;
    } catch {
      // fall through to synth
    }
  }

  // 2) WebAudio "ding–dong" fallback (best-effort)
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new AC();
    await ctx.resume().catch(() => {});
    const now = ctx.currentTime;

    const playBell = (at: number, freq: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      // slight pitch shimmer
      o.frequency.setValueAtTime(freq, at);
      o.frequency.exponentialRampToValueAtTime(freq * 0.8, at + 0.18);

      // ADSR
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.6, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);

      o.connect(g);
      g.connect(ctx.destination);
      o.start(at);
      o.stop(at + 0.4);
    };

    // Ding (higher) then Dong (lower)
    playBell(now + 0.00, 880);     // A5 ~ ding
    playBell(now + 0.28, 659.25);  // E5 ~ dong

    playedOnce.current = true;
  } catch {
    // If even this fails, skip silently.
  }
}

  // Play the chime once after the first user interaction (required by browsers)
  useEffect(() => {
    const arm = () => {
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
      void tryPlayChime();
    };
    window.addEventListener("pointerdown", arm, { passive: true });
    window.addEventListener("keydown", arm);
    return () => {
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
    };
  }, []);

  
  // query params
  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (city.trim()) p.set("city", city.trim());
    if (min.trim())  p.set("min", String(Number(min)));
    if (max.trim())  p.set("max", String(Number(max)));
    if (instant)     p.set("instant", "true");
    p.set("limit", String(limit)); // use derived limit from URL
    return p;
  }, [city, min, max, instant, limit]);
  

  // fetch list
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        setError(null);
        setLoading(true);
  
        // Build API params: reuse filters + add offset
        const apiParams = new URLSearchParams(params);
        apiParams.set("offset", String(offset));
        const sort = searchParams.get("sort") ?? "";
        if (sort) apiParams.set("sort", sort);
        
        const res = await fetch(`${API}/api/listings?${apiParams.toString()}`, { signal: controller.signal });
        if (!res.ok) throw new Error("Bad response");
  
        const payload = await res.json() as {
          data: Listing[];
          page: { total: number; offset: number; limit: number; hasMore: boolean };
        };
        
        const total = payload.page.total;
        const lastPage = Math.max(1, Math.ceil(total / limit));
        
        // If we’re on a page whose offset is beyond the total, snap to the last valid page.
        // Example: city=George Town has only 5 results, but URL says page=2 (offset=8) → empty.
        // This will rewrite ?page=2 → ?page=1 (or last page), then refetch.
        if (total > 0 && offset >= total) {
          const next = new URLSearchParams(searchParams);
          next.set("page", String(lastPage));
          setSearchParams(next, { replace: true });
          return; // let the effect re-run with the corrected page
        }
        
        setPageInfo(payload.page);
        
        // Replace on first page; append on subsequent pages
        setItems(prev =>
          (page <= 1 || !prev) ? payload.data : [...prev, ...payload.data]
        );
        
  
        if (!firstLoadComplete) setFirstLoadComplete(true);
      } catch (e: any) {
        if (e.name !== "AbortError") setError("Failed to load listings");
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
    // Re-fetch when filters (params) or paging (offset) change
  }, [params, offset, searchParams]);
  

  // fade out splash once first load + min delay are both done
  useEffect(() => {
    if (firstLoadComplete && minDelayDone && showSplash) {
      setSplashFade(true);
      const t = setTimeout(() => setShowSplash(false), 420);
      return () => clearTimeout(t);
    }
  }, [firstLoadComplete, minDelayDone, showSplash]);

  const resetFilters = () => { setCity(""); setMin(""); setMax(""); setInstant(false); };

  return (
    <div style={{ background: COLORS.bg, minHeight: "100dvh" }}>
      {/* Hidden audio element (will play if file exists & autoplay allowed) */}
      <audio ref={audioRef} src="/sfx/door-bell.mp3" preload="metadata" />

      {/* SPLASH (first load only) */}
      {showSplash && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background:
              "radial-gradient(1200px 600px at 50% -10%, #10263d55, transparent 60%), #0b1220",
            display: "grid",
            placeItems: "center",
            zIndex: 1000,
            transition: "opacity 420ms ease",
            opacity: splashFade ? 0 : 1,
            pointerEvents: splashFade ? "none" : "auto",
          }}
        >
          <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>

          {/* LOGOMARK */}
          <div style={{ textAlign: "center" }}>
            <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden focusable="false"
                 style={{ display: "block", margin: "0 auto 10px" }}>
              <defs>
                <filter id="s" x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.4"/>
                </filter>
              </defs>
              <rect x="10" y="26" rx="12" ry="12" width="64" height="44" fill="#10263d" stroke="#1c3b5a" strokeWidth="2" filter="url(#s)"/>
              <path d="M58 22c-5.5 0-10 4.5-10 10 0 3.6 1.9 6.8 4.7 8.6-6-0.9-10.7-6.1-10.7-12.4 0-6.9 5.6-12.5 12.5-12.5 3.1 0 5.9 1.1 8.1 2.9-1.2-0.4-2.5-0.6-3.9-0.6z" fill="#f4c430"/>
              <circle cx="68" cy="18" r="2" fill="#f4c430"/>
              <circle cx="63" cy="14" r="1.4" fill="#f4c430"/>
              <circle cx="54" cy="16" r="1.2" fill="#f4c430"/>
              <circle cx="26" cy="44" r="2.2" fill="#e9edf5"/>
              <circle cx="32" cy="44" r="2.2" fill="#e9edf5"/>
              <circle cx="26" cy="50" r="2.2" fill="#e9edf5"/>
              <circle cx="32" cy="50" r="2.2" fill="#e9edf5"/>
            </svg>

            <div style={{ fontSize: 44, fontWeight: 900, letterSpacing: 0.3, marginBottom: 12, color: COLORS.text }}>
              <span>Sleep</span><span style={{ color: COLORS.gold }}>Inn</span>
            </div>

            <div style={{ display: "inline-flex", gap: 10, alignItems: "center", color: COLORS.sub }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  border: `3px solid ${COLORS.goldDark}`,
                  borderTopColor: COLORS.gold,
                  animation: "spin 1s linear infinite",
                }}
              />
              <span>Loading your stays…</span>
            </div>
          </div>
        </div>
      )}

      {/* outer wrapper centers content block */}
      <main
        style={{
          width: "min(1200px, 96vw)",
          margin: "0 auto",
          padding: "24px 16px",
          color: COLORS.text,
        }}
      >
        <h1 style={{ fontSize: 36, fontWeight: 900, marginBottom: 6, letterSpacing: 0.3 }}>
          <span style={{ color: COLORS.text }}>Sleep</span>
          <span style={{ color: COLORS.gold }}>Inn</span>
        </h1>
        <div style={{ color: COLORS.sub, marginBottom: 16 }}>
          Browse listings · Filter · Click to view details
        </div>

        {/* Filter Bar */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "end",
            background: COLORS.panel,
            border: `1px solid ${COLORS.border}`,
            padding: 12,
            borderRadius: 14,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <label style={{ fontSize: 12, color: COLORS.sub }}>City</label>
            <input
              placeholder="e.g. Kuala"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              style={{
                border: `1px solid ${COLORS.border}`,
                borderRadius: 10,
                padding: "10px 12px",
                width: 220,
                background: COLORS.bg,
                color: COLORS.text,
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <label style={{ fontSize: 12, color: COLORS.sub }}>Min RM</label>
            <input
              type="number"
              value={min}
              onChange={(e) => setMin(e.target.value)}
              style={{
                border: `1px solid ${COLORS.border}`,
                borderRadius: 10,
                padding: "10px 12px",
                width: 140,
                background: COLORS.bg,
                color: COLORS.text,
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <label style={{ fontSize: 12, color: COLORS.sub }}>Max RM</label>
            <input
              type="number"
              value={max}
              onChange={(e) => setMax(e.target.value)}
              style={{
                border: `1px solid ${COLORS.border}`,
                borderRadius: 10,
                padding: "10px 12px",
                width: 140,
                background: COLORS.bg,
                color: COLORS.text,
              }}
            />
          </div>

          <label style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: 6, color: COLORS.text }}>
            <input type="checkbox" checked={instant} onChange={(e) => setInstant(e.target.checked)} />
            Instant book
          </label>


          {/* SORT (URL-synced) */}
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: 6, color: COLORS.text }}>
            <span>Sort</span>
            <select
              value={searchParams.get("sort") ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                const next = new URLSearchParams(searchParams);
                if (v) next.set("sort", v); else next.delete("sort");
                next.set("page", "1");                // reset to first page when sort changes
                setSearchParams(next, { replace: true });
              }}
            >
              <option value="">— Sort —</option>
              <option value="price_asc">Price: Low → High</option>
              <option value="price_desc">Price: High → Low</option>
              <option value="newest">Newest</option>
            </select>
          </label>


          {/* LIMIT (URL-synced) */}
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: 6, color: COLORS.text }}>
            <span>Per page</span>
            <select
              value={(() => {
                const v = searchParams.get("limit");
                return v ?? "8"; // default
              })()}
              onChange={(e) => {
                const v = e.target.value; // "8" | "12" | "24" | "48"
                const next = new URLSearchParams(searchParams);
                next.set("limit", v);
                next.set("page", "1"); // reset to first page when page size changes
                setSearchParams(next, { replace: true });
              }}
            >
              <option value="8">8</option>
              <option value="12">12</option>
              <option value="24">24</option>
              <option value="48">48</option>
            </select>
          </label>



          <button
            onClick={resetFilters}
            style={{
              marginLeft: "auto",
              padding: "10px 14px",
              borderRadius: 10,
              border: `1px solid ${COLORS.gold}`,
              color: COLORS.bg,
              background: COLORS.gold,
              fontWeight: 700,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.goldDark)}
            onMouseLeave={(e) => (e.currentTarget.style.background = COLORS.gold)}
          >
            Reset
          </button>
        </div>

        {/* States */}
        {loading && <div style={{ marginTop: 16 }}>Loading…</div>}
        {error && <div style={{ marginTop: 16, color: "salmon" }}>{error}</div>}
        {items && items.length === 0 && <div style={{ marginTop: 16 }}>No listings match your filters.</div>}

        {/* Grid */}
{items && items.length > 0 && (
  <>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
        gap: 14,
        marginTop: 16,
      }}
    >
      {items.map((l) => (
        <article
          key={l.id}
          onClick={() => navigate({ pathname: `/listing/${l.id}`, search: searchParams.toString() })}
          style={{
            cursor: "pointer",
            border: `1px solid ${COLORS.border}`,
            borderRadius: 14,
            overflow: "hidden",
            background: COLORS.card,
            transition: "transform 120ms ease, box-shadow 120ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = `0 10px 28px rgba(0,0,0,0.35)`;
            e.currentTarget.style.transform = "translateY(-2px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "none";
            e.currentTarget.style.transform = "none";
          }}
        >
          {l.photos?.[0]?.url ? (
            <img
              src={l.photos[0].url}
              alt={l.photos[0].alt ?? ""}
              loading="lazy" 
              style={{ width: "100%", height: 180, objectFit: "cover" }}
            />
          ) : (
            <div style={{ width: "100%", height: 180, background: COLORS.panel }} />
          )}
          <div style={{ padding: 12 }}>
            <div style={{ fontWeight: 800, color: COLORS.text }}>{l.title}</div>
            <div style={{ color: COLORS.sub }}>{l.city}, {l.country}</div>
            <div style={{ marginTop: 8 }}>
              <b style={{ color: COLORS.gold }}>
                RM {Number(l.price_per_night).toFixed(2)}
              </b>{" "}
              <span style={{ color: COLORS.sub }}>/ night · {l.beds} beds · {l.baths} baths</span>
            </div>
            {l.is_instant_book && (
              <div style={{ marginTop: 6, fontSize: 12, color: COLORS.gold }}>Instant book</div>
            )}
          </div>
        </article>
      ))}
    </div>

    {/* Load more */}
    {pageInfo?.hasMore && (
      <div style={{ display: "flex", justifyContent: "center", margin: "18px 0 8px" }}>
        <button
          onClick={() => {
            const next = new URLSearchParams(searchParams);
            const currPage = Math.max(1, Number(next.get("page") ?? "1"));
            next.set("page", String(currPage + 1));
            setSearchParams(next, { replace: false }); // keep history for page steps
          }}
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            border: `1px solid ${COLORS.gold}`,
            color: COLORS.bg,
            background: COLORS.gold,
            fontWeight: 800,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.goldDark)}
          onMouseLeave={(e) => (e.currentTarget.style.background = COLORS.gold)}
          disabled={loading}
        >
          {loading ? "Loading..." : "Load more"}
        </button>
      </div>
    )}
  </>
)}

      </main>
    </div>
  );
}
