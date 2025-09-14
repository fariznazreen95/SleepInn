import { useEffect, useState } from "react";
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

            <div
              style={{
                marginTop: 12,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(240px,1fr))",
                gap: 10,
              }}
            >
              {item.photos.map((p, i) => (
                <img
                  key={i}
                  src={p.url}
                  alt={p.alt ?? ""}
                  style={{ width: "100%", aspectRatio: "16/10", objectFit: "cover", borderRadius: 10 }}
                />
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
    </div>
  );
}
