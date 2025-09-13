import { useEffect, useMemo, useRef, useState } from "react";

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

  // data
  const [items, setItems] = useState<Listing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(false);

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
        el.currentTime = 0;
        el.volume = 0.45;
        await el.play(); // may be blocked; if so, fall through
        playedOnce.current = true;
        return;
      } catch {
        /* ignore and try synth */
      }
    }

    // 2) WebAudio "ding–dong" fallback (best-effort, may still be blocked silently)
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
      playBell(now + 0.00, 880); // A5 ~ ding
      playBell(now + 0.28, 659.25); // E5 ~ dong

      playedOnce.current = true;
    } catch {
      // If even this fails, we just skip sound silently.
    }
  }

  // Attempt to play chime on initial splash show
  useEffect(() => { void tryPlayChime(); }, []);

  // query params
  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (city.trim()) p.set("city", city.trim());
    if (min.trim()) p.set("min", String(Number(min)));
    if (max.trim()) p.set("max", String(Number(max)));
    if (instant) p.set("instant", "true");
    p.set("limit", "24");
    return p;
  }, [city, min, max, instant]);

  // fetch list
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        setError(null);
        setLoading(true);
        setItems(null);
        const res = await fetch(`${API}/api/listings?${params.toString()}`, { signal: controller.signal });
        if (!res.ok) throw new Error("Bad response");
        const data: Listing[] = await res.json();
        setItems(data);
        if (!firstLoadComplete) setFirstLoadComplete(true);
      } catch (e: any) {
        if (e.name !== "AbortError") setError("Failed to load listings");
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [params]);

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
      <audio ref={audioRef} src="/sfx/sleepinn-chime.mp3" preload="auto" />

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
                onClick={() => setSelected(l)}
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
        )}

        {/* Details Panel */}
        {selected && (
          <div
            onClick={() => setSelected(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(6,12,20,0.7)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              padding: 16,
              zIndex: 50,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "min(1000px, 96vw)",
                maxHeight: "90vh",
                overflow: "auto",
                background: COLORS.panel,
                color: COLORS.text,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 16,
                padding: 16,
                boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ fontSize: 22, fontWeight: 900 }}>
                  <span>{selected.title}</span>
                </h2>
                <button
                  onClick={() => setSelected(null)}
                  style={{
                    border: `1px solid ${COLORS.gold}`,
                    borderRadius: 10,
                    padding: "8px 12px",
                    background: COLORS.gold,
                    color: COLORS.bg,
                    fontWeight: 800,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.goldDark)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = COLORS.gold)}
                >
                  Close
                </button>
              </div>

              <div style={{ color: COLORS.sub }}>{selected.city}, {selected.country}</div>

              <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ color: COLORS.text }}>
                  RM <b style={{ color: COLORS.gold }}>{Number(selected.price_per_night).toFixed(2)}</b> / night
                </span>
                <span style={{ color: COLORS.sub }}>• {selected.beds} beds</span>
                <span style={{ color: COLORS.sub }}>• {selected.baths} baths</span>
                {selected.is_instant_book && <span style={{ color: COLORS.gold }}>• Instant book</span>}
              </div>

              {/* Gallery */}
              <div
                style={{
                  marginTop: 12,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(240px,1fr))",
                  gap: 10,
                }}
              >
                {selected.photos.map((p, i) => (
                  <img
                    key={i}
                    src={p.url}
                    alt={p.alt ?? ""}
                    style={{ width: "100%", aspectRatio: "16/10", objectFit: "cover", borderRadius: 10 }}
                  />
                ))}
              </div>

              {selected.description && (
                <>
                  <h3 style={{ marginTop: 16, fontWeight: 800, color: COLORS.text }}>About this place</h3>
                  <p style={{ marginTop: 6, lineHeight: 1.6, color: COLORS.sub }}>{selected.description}</p>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
