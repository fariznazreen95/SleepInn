import { useEffect, useState } from 'react';

type Photo = { url: string; alt: string | null };
type Listing = {
  id: number;
  title: string;
  description: string | null;
  price_per_night: string;           // matches API field name
  city: string;
  country: string;
  beds: number;
  baths: number;
  is_instant_book: boolean;
  photos: Photo[];
};

export default function App() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [error, setError] = useState<string | null>(null);
  const API = import.meta.env.VITE_API_URL || 'http://localhost:5174';

  useEffect(() => {
    fetch(`${API}/api/listings`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setListings)
      .catch(e => setError(String(e)));
  }, [API]);

  if (error) {
    return <main style={{ padding: 24 }}>
      <h1>SleepInn — Listings</h1>
      <p style={{ color: 'crimson' }}>Failed to load listings: {error}</p>
    </main>;
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>SleepInn — Listings</h1>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 16
      }}>
        {listings.map(l => (
          <article key={l.id} style={{ border: '1px solid #ddd', borderRadius: 12, overflow: 'hidden' }}>
            <img
              src={l.photos?.[0]?.url}
              alt={l.photos?.[0]?.alt ?? 'photo'}
              style={{ width: '100%', height: 160, objectFit: 'cover' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <div style={{ padding: 12 }}>
              <h3 style={{ margin: '4px 0' }}>{l.title}</h3>
              <div style={{ opacity: 0.8 }}>{l.city}, {l.country}</div>
              <div style={{ marginTop: 8 }}>
                <b>RM {l.price_per_night}</b> / night · {l.beds} beds · {l.baths} baths
              </div>
              {l.is_instant_book && (
                <div style={{ marginTop: 6, fontSize: 12, color: 'green' }}>Instant book</div>
              )}
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
