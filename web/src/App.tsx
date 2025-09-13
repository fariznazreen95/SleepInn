import { useEffect, useMemo, useState } from "react";

type Photo = { url: string; alt: string | null };
type Listing = {
  id: number;
  title: string;
  description: string | null;
  price_per_night: string;   // API returns TEXT (snake_case)
  city: string;
  country: string;
  beds: number;
  baths: number;
  is_instant_book: boolean;
  photos: Photo[];
};

const API = import.meta.env.VITE_API_URL ?? "http://localhost:5174";

export default function App() {
  // --- filter state ---
  const [city, setCity] = useState("");
  const [min, setMin] = useState<string>("");
  const [max, setMax] = useState<string>("");
  const [instant, setInstant] = useState(false);

  // --- data state ---
  const [items, setItems] = useState<Listing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(false);

  // build query params
  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (city.trim()) p.set("city", city.trim());
    if (min.trim()) p.set("min", String(Number(min)));
    if (max.trim()) p.set("max", String(Number(max)));
    if (instant) p.set("instant", "true");
    p.set("limit", "24");
    return p;
  }, [city, min, max, instant]);

  // fetch when params change
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        setError(null);
        setLoading(true);
        setItems(null);
        const res = await fetch(`${API}/api/listings?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Bad response");
        const data: Listing[] = await res.json();
        setItems(data);
      } catch (e) {
        if ((e as any).name !== "AbortError") setError("Failed to load listings");
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [params]);

  const resetFilters = () => {
    setCity("");
    setMin("");
    setMax("");
    setInstant(false);
  };

  return (
    <main style={{ maxWidth: 1120, margin: "0 auto", padding: 16, color: "#eaeaea" }}>
      <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 8, color: "#eaeaea" }}>SleepInn</h1>
      <div style={{ opacity: 0.7, marginBottom: 16 }}>Browse listings · Filter · Click to view details</div>

      {/* Filter Bar */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end",
        border: "1px solid #333", padding: 12, borderRadius: 12, background: "#1f1f1f"
      }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <label style={{ fontSize: 12, opacity: 0.8 }}>City</label>
          <input
            placeholder="e.g. Kuala"
            value={city}
            onChange={e => setCity(e.target.value)}
            style={{ border: "1px solid #444", borderRadius: 8, padding: "8px 10px", width: 200, background:"#111", color:"#eee" }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <label style={{ fontSize: 12, opacity: 0.8 }}>Min RM</label>
          <input
            type="number"
            value={min}
            onChange={e => setMin(e.target.value)}
            style={{ border: "1px solid #444", borderRadius: 8, padding: "8px 10px", width: 120, background:"#111", color:"#eee" }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <label style={{ fontSize: 12, opacity: 0.8 }}>Max RM</label>
          <input
            type="number"
            value={max}
            onChange={e => setMax(e.target.value)}
            style={{ border: "1px solid #444", borderRadius: 8, padding: "8px 10px", width: 120, background:"#111", color:"#eee" }}
          />
        </div>

        <label style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: 8 }}>
          <input
            type="checkbox"
            checked={instant}
            onChange={e => setInstant(e.target.checked)}
          />
          Instant book
        </label>

        <button
          onClick={resetFilters}
          style={{ marginLeft: "auto", padding: "8px 12px", borderRadius: 8, border: "1px solid #444", background: "#111", color:"#eee" }}
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
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 12,
          marginTop: 16
        }}>
          {items.map(l => (
            <article
              key={l.id}
              onClick={() => setSelected(l)}
              style={{
                cursor: "pointer",
                border: "1px solid #333",
                borderRadius: 12,
                overflow: "hidden",
                transition: "box-shadow 0.15s",
                background:"#1b1b1b"
              }}
              onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.4)")}
              onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
            >
              {l.photos?.[0]?.url ? (
                <img src={l.photos[0].url} alt={l.photos[0].alt ?? ""} style={{ width: "100%", height: 180, objectFit: "cover" }} />
              ) : (
                <div style={{ width: "100%", height: 180, background: "#2a2a2a" }} />
              )}
              <div style={{ padding: 12 }}>
                <div style={{ fontWeight: 700, color:"#eee" }}>{l.title}</div>
                <div style={{ opacity: 0.8 }}>{l.city}, {l.country}</div>
                <div style={{ marginTop: 8 }}>
                  <b>RM {Number(l.price_per_night).toFixed(2)}</b> / night · {l.beds} beds · {l.baths} baths
                </div>
                {l.is_instant_book && (
                  <div style={{ marginTop: 6, fontSize: 12, color: "lightgreen" }}>Instant book</div>
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
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
            display: "flex", justifyContent: "center", alignItems: "center", padding: 16
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: "min(960px, 96vw)", maxHeight: "90vh", overflow: "auto", background: "#121212", color:"#eaeaea", border: "1px solid #333", borderRadius: 14, padding: 16 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>{selected.title}</h2>
              <button onClick={() => setSelected(null)} style={{ border: "1px solid #444", borderRadius: 8, padding: "6px 10px", background:"#1b1b1b", color:"#eaeaea" }}>Close</button>
            </div>
            <div style={{ opacity: 0.8 }}>{selected.city}, {selected.country}</div>
            <div style={{ marginTop: 8, display: "flex", gap: 12, alignItems: "center" }}>
              <span>RM <b>{Number(selected.price_per_night).toFixed(2)}</b> / night</span>
              <span>• {selected.beds} beds</span>
              <span>• {selected.baths} baths</span>
              {selected.is_instant_book && <span style={{ color: "lightgreen" }}>• Instant book</span>}
            </div>

            {/* Gallery */}
            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 8 }}>
              {selected.photos.map((p, i) => (
                <img key={i} src={p.url} alt={p.alt ?? ""} style={{ width: "100%", aspectRatio: "16/10", objectFit: "cover", borderRadius: 8 }} />
              ))}
            </div>

            {/* Description */}
            {selected.description && (
              <>
                <h3 style={{ marginTop: 16, fontWeight: 600 }}>About this place</h3>
                <p style={{ marginTop: 6, lineHeight: 1.6 }}>{selected.description}</p>
              </>
            )}

            {/* Actions (stub) */}
            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
              <button style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #222", background: "#111", color: "#fff" }}>
                Reserve (stub)
              </button>
              <button style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #444", background: "#1b1b1b", color:"#eaeaea" }}>
                Inquiry (stub)
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
