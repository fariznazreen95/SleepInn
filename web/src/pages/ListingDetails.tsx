import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

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

const COLORS = {
  panel: "#0e2033",
  border: "#1c3b5a",
  text: "#e9edf5",
  sub: "rgba(233,237,245,0.75)",
  gold: "#f4c430",
  goldDark: "#caa50a",
};

export default function ListingDetails() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();

  const [item, setItem] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // ---- Hover preview overlay state -----------------------------------------
  const [hoverSrc, setHoverSrc] = useState<string | null>(null);
  const hideTimer = useRef<number | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const overlayImgRef = useRef<HTMLImageElement | null>(null);

  const cancelHide = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };
  const scheduleHide = () => {
    cancelHide();
    hideTimer.current = window.setTimeout(() => setHoverSrc(null), 140);
  };

  // Animate the preview overlay in when it appears
  useEffect(() => {
    if (!hoverSrc) return;
    requestAnimationFrame(() => {
      if (overlayRef.current) overlayRef.current.style.opacity = "1";
      if (overlayImgRef.current) {
        overlayImgRef.current.style.opacity = "1";
        overlayImgRef.current.style.transform = "scale(1)";
      }
    });
  }, [hoverSrc]);

  // When preview is open, let Escape close the preview (not the whole details)
  useEffect(() => {
    if (!hoverSrc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setHoverSrc(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [hoverSrc]);

  // ---- Fetch item -----------------------------------------------------------
  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        setErr(null);
        setLoading(true);
        const res = await fetch(`${API}/api/listings/${id}`);
        if (!res.ok) {
          if (res.status === 404) throw new Error("not-found");
          throw new Error("bad");
        }
        const data: Listing = await res.json();
        if (!aborted) setItem(data);
      } catch (e: any) {
        if (!aborted) setErr(e?.message === "not-found" ? "Not found" : "Failed to load listing.");
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
    return () => { aborted = true; };
  }, [id]);

  // Close details overlay with Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !hoverSrc) {
        navigate({ pathname: "/", search: search.toString() });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, search, hoverSrc]);

  return (
    <div
      style={{
        background: "rgba(6,12,20,0.7)",
        position: "fixed",
        inset: 0,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: 16,
        zIndex: 100,
      }}
      onClick={() => navigate({ pathname: "/", search: search.toString() })}
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
          <h2 style={{ fontSize: 22, fontWeight: 900, marginRight: 12 }}>
            {item ? item.title : "Listing"}
          </h2>
          <button
            onClick={() => navigate({ pathname: "/", search: search.toString() })}
            style={{
              border: `1px solid ${COLORS.gold}`,
              borderRadius: 10,
              padding: "8px 12px",
              background: COLORS.gold,
              color: "#0b1220",
              fontWeight: 800,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.goldDark)}
            onMouseLeave={(e) => (e.currentTarget.style.background = COLORS.gold)}
          >
            Close
          </button>
        </div>

        {loading && <div style={{ marginTop: 10, color: COLORS.sub }}>Loading…</div>}
        {err && <div style={{ marginTop: 10, color: "salmon" }}>{err}</div>}

        {item && (
          <>
            <div style={{ color: COLORS.sub }}>{item.city}, {item.country}</div>

            <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <span>
                RM <b style={{ color: COLORS.gold }}>{Number(item.price_per_night).toFixed(2)}</b> / night
              </span>
              <span style={{ color: COLORS.sub }}>• {item.beds} beds</span>
              <span style={{ color: COLORS.sub }}>• {item.baths} baths</span>
              {item.is_instant_book && <span style={{ color: COLORS.gold }}>• Instant book</span>}
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
              {item.photos.map((p, i) => (
                <div
                  key={i}
                  style={{
                    borderRadius: 10,
                    overflow: "hidden",
                    position: "relative",
                    cursor: "zoom-in",
                  }}
                  onMouseEnter={() => { cancelHide(); setHoverSrc(p.url); }}
                  onMouseLeave={scheduleHide}
                >
                  <img
                    src={p.url}
                    alt={p.alt ?? ""}
                    style={{
                      width: "100%",
                      aspectRatio: "16/10",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                </div>
              ))}
            </div>

            {item.description && (
              <>
                <h3 style={{ marginTop: 16, fontWeight: 800 }}>About this place</h3>
                <p style={{ marginTop: 6, lineHeight: 1.6, color: COLORS.sub }}>{item.description}</p>
              </>
            )}
          </>
        )}
      </div>

      {/* Hover preview overlay (centered) */}
      {hoverSrc && (
        <div
          ref={overlayRef}
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
          onClick={(e) => { e.stopPropagation(); setHoverSrc(null); }}
          style={{
            position: "fixed",
            inset: 0,
            display: "grid",
            placeItems: "center",
            background: "rgba(0,0,0,0.45)",
            zIndex: 2000,
            opacity: 0, // animate to 1
            transition: "opacity 160ms ease",
            cursor: "zoom-out",
          }}
        >
          <img
            ref={overlayImgRef}
            src={hoverSrc}
            alt=""
            style={{
              maxWidth: "min(92vw, 1100px)",
              maxHeight: "86vh",
              borderRadius: 12,
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
              transform: "scale(0.98)", // animate to 1
              opacity: 0,               // animate to 1
              transition: "transform 180ms ease, opacity 180ms ease",
            }}
          />
        </div>
      )}
    </div>
  );
}
