import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

// Add once at the top-level, e.g., after imports:
const styleEl = document.getElementById("sleepinn-blurup-style") ?? (() => {
  const el = document.createElement("style");
  el.id = "sleepinn-blurup-style";
  el.textContent = `
    @keyframes shimmer { 
      0% { background-position: 0% 0; }
      100% { background-position: 200% 0; }
    }
  `;
  document.head.appendChild(el);
  return el;
})();

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

// base reset: remove white body margin + ensure dark bg edge-to-edge
const baseCSS = document.getElementById("sleepinn-base-style") ?? (() => {
  const el = document.createElement("style");
  el.id = "sleepinn-base-style";
  el.textContent = `
    html, body, #root { height: 100%; }
    body { margin: 0; background: ${COLORS.bg}; }
  `;
  document.head.appendChild(el);
  return el;
})();

// one-time style for nicer <select>
const selectCSS = document.getElementById("sleepinn-select-style") ?? (() => {
  const el = document.createElement("style");
  el.id = "sleepinn-select-style";
  el.textContent = `
    .si-select{
      appearance: none; -webkit-appearance: none; -moz-appearance: none;
      background: ${COLORS.bg};
      color: ${COLORS.text};
      border: 1px solid ${COLORS.border};
      border-radius: 10px;
      padding: 8px 36px 8px 10px;
      line-height: 1.2;
    }
    .si-select:focus{ outline: none; box-shadow: 0 0 0 2px ${COLORS.gold}; border-color: ${COLORS.gold}; }
    .si-select::-ms-expand{ display: none; }
    .si-select{
      background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'><path d='M1 3.5 L5 7 L9 3.5' stroke='${encodeURIComponent(COLORS.text)}' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>");
      background-repeat: no-repeat;
      background-position: right 10px center;
      background-size: 10px 10px;
    }
  `;
  document.head.appendChild(el);
  return el;
})();

// ---- Rounded dropdown (custom select) ---------------------------------------
type Option = { value: string; label: string };

function UiSelect({
  value,
  onChange,
  options,
  width = 160,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  width?: number;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hoverIdx, setHoverIdx] = useState(
    Math.max(0, options.findIndex((o) => o.value === value))
  );
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current || !menuRef.current) return;
      if (!btnRef.current.contains(t) && !menuRef.current.contains(t)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    if (open) {
      setHoverIdx(Math.max(0, options.findIndex((o) => o.value === value)));
    }
  }, [open, value, options]);

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <div style={{ position: "relative", width }}>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHoverIdx((i) => Math.min(options.length - 1, (i ?? 0) + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            setHoverIdx((i) => Math.max(0, (i ?? 0) - 1));
          } else if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (open) choose(options[hoverIdx]?.value ?? value);
            else setOpen(true);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "8px 36px 8px 10px",
          borderRadius: 10,
          border: `1px solid ${COLORS.border}`,
          background: COLORS.bg,
          color: COLORS.text,
          position: "relative",
        }}
      >
        <span>
          {options.find((o) => o.value === value)?.label ?? "— Select —"}
        </span>
        <span
          aria-hidden
          style={{
            position: "absolute",
            right: 10,
            top: "50%",
            transform: "translateY(-50%)",
          }}
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="listbox"
          tabIndex={-1}
          style={{
            position: "absolute",
            zIndex: 10, // above the Reset button (which is zIndex:2)
            top: "calc(100% + 6px)",
            left: 0,
            width: "100%",
            maxHeight: 240,
            overflowY: "auto",
            background: COLORS.bg,
            color: COLORS.text,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 10, // <-- rounded dropdown panel
            boxShadow: "0 10px 24px rgba(0,0,0,0.35)",
          }}
        >
          {options.map((opt, idx) => {
            const active = value === opt.value;
            const hover = idx === hoverIdx;
            return (
                <div
                  key={opt.value}
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setHoverIdx(idx)}
                  // choose on press (works for mouse + touch/pen), then swallow event so it doesn't re-toggle
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    choose(opt.value); // this sets open=false
                  }}
                  style={{
                    padding: "8px 10px",
                    cursor: "pointer",
                    background: hover ? COLORS.panel : "transparent",
                    fontWeight: active ? 800 : 500,
                    borderBottom:
                      idx < options.length - 1
                        ? `1px solid ${COLORS.border}`
                        : "none",
                  }}
                >
                  {opt.label}
                </div>

            );
          })}
        </div>
      )}
    </div>
  );
}


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

  // Clear the current list when filters/sort change and page is 1
  useEffect(() => {
    if (page === 1) setItems(null);
  }, [city, min, max, instant, searchParams]);
  
  // --- Hover Preview State (overlay controller) ---
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewListing, setPreviewListing] = useState<Listing | null>(null);
  const [previewIdx, setPreviewIdx] = useState(0);

  // to avoid flicker when moving pointer from card → overlay
  const closePreviewTimer = useRef<number | null>(null);
  const requestIdRef = useRef(0);


  // open preview for a listing at photo index
  function openPreview(listing: Listing, idx = 0) {
    if (closePreviewTimer.current) {
      window.clearTimeout(closePreviewTimer.current);
      closePreviewTimer.current = null;
    }
    setPreviewListing(listing);
    setPreviewIdx(Math.max(0, Math.min(idx, (listing.photos?.length ?? 1) - 1)));
    setPreviewOpen(true);
  }

  // schedule a gentle close (lets user move into the overlay)
  function scheduleClosePreview(delayMs = 120) {
    if (closePreviewTimer.current) window.clearTimeout(closePreviewTimer.current);
    closePreviewTimer.current = window.setTimeout(() => {
      setPreviewOpen(false);
      setPreviewListing(null);
    }, delayMs) as unknown as number;
  }

  // hard close (Esc)
  function closePreviewNow() {
    if (closePreviewTimer.current) window.clearTimeout(closePreviewTimer.current);
    closePreviewTimer.current = null;
    if ((window as any).__hoverTimer) {
      clearTimeout((window as any).__hoverTimer);
      (window as any).__hoverTimer = null;
    }
        setPreviewOpen(false);
    setPreviewListing(null);
  }

  // keyboard: ←/→ cycle, Esc closes
  useEffect(() => {
    if (!previewOpen) return;
    function onKey(e: KeyboardEvent) {
      if (!previewListing) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const n = (previewListing.photos?.length ?? 1);
        if (n > 1) setPreviewIdx((i) => (i - 1 + n) % n);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const n = (previewListing.photos?.length ?? 1);
        if (n > 1) setPreviewIdx((i) => (i + 1) % n);
      } else if (e.key === "Escape") {
        e.preventDefault();
        closePreviewNow();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewOpen, previewListing]);


  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pageInfo, setPageInfo] = useState<{
    total: number; offset: number; limit: number; hasMore: boolean
  } | null>(null);

// Restore scroll position if we have one saved for the current filter URL
useEffect(() => {
  if (!items || items.length === 0) return;

  const key = `gridScroll:${searchParams.toString()}`;
  const saved = sessionStorage.getItem(key);
  if (!saved) return;

  const y = Number(saved) || 0;

  // Let layout paint before scrolling back
  requestAnimationFrame(() => {
    window.scrollTo({ top: y, behavior: "auto" });
    // one more frame just in case images/layout expand
    requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "auto" }));
  });

  // consume it so it doesn't keep forcing position
  sessionStorage.removeItem(key);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [items, searchParams]);


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
    const id = ++requestIdRef.current; // tag this request as the latest
    const controller = new AbortController();
    (async () => {
      try {
        setError(null);
        setLoading(true);
  
        // Build API params: reuse filters + add offset
        const apiParams = new URLSearchParams(params);
        apiParams.set("limit", String(limit));
        apiParams.set("offset", String(offset));
        const sort = searchParams.get("sort") ?? "";
        if (sort) apiParams.set("sort", sort);
        
        const res = await fetch(`${API}/api/listings?${apiParams.toString()}`, { signal: controller.signal });
        if (!res.ok) throw new Error("Bad response");
  
        const payload = await res.json() as {
          data: Listing[];
          page: { total: number; offset: number; limit: number; hasMore: boolean };
        };
      
        if (id !== requestIdRef.current) return; // a newer request finished, ignore this one

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

        // Fresh replace on page 1; append on subsequent pages
        if (page === 1) {
          setItems(payload.data);
        } else {
          setItems(prev => [...(prev ?? []), ...payload.data]);
        }
  
        if (!firstLoadComplete) setFirstLoadComplete(true);
      } catch (e: any) {
        if (e.name !== "AbortError") setError("Failed to load listings");
      } finally {
        if (id === requestIdRef.current) setLoading(false);
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

  const resetFilters = () => {
    // clear URL filters and snap to defaults
    const next = new URLSearchParams();
    next.set("page", "1");
    next.set("limit", "8"); // keep default explicit
    setSearchParams(next, { replace: true });
  
    // local inputs (will sync from URL too)
    setCity(""); setMin(""); setMax(""); setInstant(false);
  
    // UX: scroll to top of grid
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  

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
            gap: 12,
            alignItems: "center",
            background: COLORS.panel,
            border: `1px solid ${COLORS.border}`,
            padding: 14,
            borderRadius: 12,
            position: "relative",
            paddingRight: 96,
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
            <UiSelect
              ariaLabel="Sort"
              width={180}
              value={searchParams.get("sort") ?? ""}
              onChange={(v) => {
                const next = new URLSearchParams(searchParams);
                if (v) next.set("sort", v); else next.delete("sort");
                next.set("page", "1");
                setSearchParams(next, { replace: true });
              }}
              options={[
                { value: "", label: "— Sort —" },
                { value: "price_asc", label: "Price: Low → High" },
                { value: "price_desc", label: "Price: High → Low" },
                { value: "newest", label: "Newest" },
              ]}
            />
          </label>

          {(searchParams.get("sort") ?? "") === "newest" && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 26,
                padding: "0 10px",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 0.3,
                color: COLORS.bg,
                background: COLORS.gold,
                border: `1px solid ${COLORS.goldDark}`,
                borderRadius: 999,
                marginLeft: 6,
                userSelect: "none",
              }}
              aria-label="Newest sort active"
              title="Sorted by newest"
            >
              Newest
            </span>
          )}


          {/* LIMIT (URL-synced) */}
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: 6, color: COLORS.text }}>
            <span>Per page</span>
            <UiSelect
              ariaLabel="Per page"
              width={90}
              value={searchParams.get("limit") ?? "8"}
              onChange={(v) => {
                const next = new URLSearchParams(searchParams);
                next.set("limit", v);
                next.set("page", "1");
                setSearchParams(next, { replace: true });
              }}
              options={[
                { value: "8",  label: "8" },
                { value: "12", label: "12" },
                { value: "24", label: "24" },
                { value: "48", label: "48" },
              ]}
            />
          </label>



          <button
            onClick={resetFilters}
            style={{
              position: "absolute",
              right: 14,
              top: 14,
              padding: "10px 14px",
              borderRadius: 10,
              border: `1px solid ${COLORS.gold}`,
              color: COLORS.bg,
              background: COLORS.gold,
              fontWeight: 700,
              zIndex: 2,
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
         
          onClick={() => {
            // remember current grid scroll so we can restore after closing details
            const key = `gridScroll:${searchParams.toString()}`;
            sessionStorage.setItem(key, String(window.scrollY));
            navigate({ pathname: `/listing/${l.id}`, search: searchParams.toString() });
          }}
          
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
          <div
            // 16:9 box so the layout doesn’t jump (we’ll still keep your blur-up)
            style={{
              position: "relative",
              width: "100%",
              aspectRatio: "16/9",
              overflow: "hidden",
              background: COLORS.panel,
            }}
            onMouseEnter={() => {
              // schedule delayed open
              const t = window.setTimeout(() => openPreview(l, 0), 500); // 900ms = just under 1s
              // store timer so we can cancel if mouse leaves quickly
              (window as any).__hoverTimer = t;
            }}
            onMouseLeave={() => {
              // cancel pending open if user bailed early
              if ((window as any).__hoverTimer) {
                clearTimeout((window as any).__hoverTimer);
                (window as any).__hoverTimer = null;
              }
              // allow time to reach the overlay area without closing
              scheduleClosePreview(180);
            }}

          >
            {l.photos?.[0]?.url ? (
              <img
                src={l.photos[0].url}
                alt={l.photos[0].alt ?? ""}
                loading="lazy"
                decoding="async"
                fetchPriority="low"
                // Start slightly blurred & scaled, then remove on load (your effect kept)
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  filter: "blur(16px)",
                  transform: "scale(1.02)",
                  transition: "filter 220ms ease, transform 220ms ease, opacity 220ms ease",
                  background:
                    "linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.08), rgba(255,255,255,0.04))",
                  backgroundSize: "200% 100%",
                  animation: "shimmer 0.9s linear infinite",
                }}
                onLoad={(e) => {
                  const el = e.currentTarget as HTMLImageElement;
                  el.style.filter = "none";
                  el.style.transform = "none";
                  el.style.animation = "none";
                  el.style.background = "none";
                }}
              />
            ) : (
              <div style={{ position: "absolute", inset: 0, background: COLORS.panel }} />
            )}
          </div>

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

    {/* Hover Preview Overlay */}
    {previewOpen && previewListing && (
      <div
        role="dialog"
        aria-label={`Preview ${previewListing.title}`}
        onMouseEnter={() => {
          // cancel any scheduled close if user enters overlay
          if (closePreviewTimer.current) {
            window.clearTimeout(closePreviewTimer.current);
            closePreviewTimer.current = null;
          }
          // also cancel any stray delayed-open timer
          if ((window as any).__hoverTimer) {
            clearTimeout((window as any).__hoverTimer);
            (window as any).__hoverTimer = null;
          }
        }}
        style={{
          position: "fixed",                // ✅ FIX: take it out of layout flow
          inset: 0,
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(0,0,0,0.5)",    // subtle backdrop
          padding: 20,
          cursor: "zoom-out",
          backdropFilter: "blur(1.5px)",
          pointerEvents: "none"
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()} // don’t close when clicking the image
          onMouseLeave={closePreviewNow}
          style={{
            position: "relative",
            maxWidth: "min(64vw, 960px)",     // ~25% smaller than before
            width: "64vw",
            aspectRatio: "16/9",
            borderRadius: 16,
            overflow: "hidden",
            boxShadow: "0 20px 40px rgba(0,0,0,0.45)",
            background: COLORS.card,
            transform: "scale(1)",
            opacity: 1,
            transition: "transform 160ms ease, opacity 160ms ease",
            pointerEvents: "auto"
          }}
        >
          {previewListing.photos?.[previewIdx]?.url ? (
            <img
              src={previewListing.photos[previewIdx].url}
              alt={previewListing.photos[previewIdx].alt ?? ""}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
              loading="eager"
              decoding="async"
            />
          ) : (
            <div style={{ position: "absolute", inset: 0, background: COLORS.panel }} />
          )}

          {(previewListing.photos?.length ?? 0) > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const n = previewListing.photos!.length;
                  setPreviewIdx((i) => (i - 1 + n) % n);
                }}
                aria-label="Previous photo"
                style={{
                  position: "absolute",
                  left: 6,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "rgba(0,0,0,0.5)",
                  border: "1px solid rgba(255,255,255,0.25)",
                  color: "white",
                  padding: "10px 12px",
                  borderRadius: 12,
                  cursor: "pointer",
                }}
              >
                ◀
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const n = previewListing.photos!.length;
                  setPreviewIdx((i) => (i + 1) % n);
                }}
                aria-label="Next photo"
                style={{
                  position: "absolute",
                  right: 6,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "rgba(0,0,0,0.5)",
                  border: "1px solid rgba(255,255,255,0.25)",
                  color: "white",
                  padding: "10px 12px",
                  borderRadius: 12,
                  cursor: "pointer",
                }}
              >
                ▶
              </button>

              <div
                style={{
                  position: "absolute",
                  right: 10,
                  bottom: 10,
                  background: "rgba(0,0,0,0.55)",
                  color: "white",
                  fontSize: 12,
                  padding: "6px 10px",
                  borderRadius: 10,
                }}
              >
                {(previewIdx + 1)} / {previewListing.photos!.length}
              </div>
            </>
          )}
        </div>
      </div>
    )}


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
