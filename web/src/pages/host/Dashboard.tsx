import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSession } from "../../lib/useSession";
import { api } from "../../lib/api";

type Row = {
  id: number;
  title: string;
  city: string;
  price_per_night: string;
  beds: number;
  baths: number;
  instant: boolean;
  description: string | null;
  published: boolean;
};

export default function HostDashboard() {
  const { user, loading } = useSession();
  const nav = useNavigate();
  const [items, setItems] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!loading && !user) nav("/login"); }, [loading, user, nav]);
  useEffect(() => { if (user) api("/api/host/listings/mine").then(d => setItems(d.items || [])); }, [user]);

  async function publish(id: number) {
    setBusy(true);
    try {
      await api(`/api/host/listings/${id}/publish`, { method: "POST" });
      const d = await api("/api/host/listings/mine");
      setItems(d.items || []);
    } finally { setBusy(false); }
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Host Dashboard</h1>
      <div style={{ marginBottom: 12 }}>
        <Link to="/host/new/edit">New Listing</Link>
      </div>
      <ul style={{ display: "grid", gap: 12 }}>
        {items.map(it => (
          <li key={it.id} style={{ padding: 12, border: "1px solid #1c3b5a", borderRadius: 8 }}>
            <div><strong>{it.title}</strong> — {it.city} — RM {Number(it.price_per_night)} / night</div>
            <div> Beds {it.beds} · Baths {it.baths} · Instant {String(it.instant)} · Status: {it.published ? "Published" : "Draft"}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <Link to={`/host/${it.id}/edit`}>Edit</Link>
              {!it.published && <button disabled={busy} onClick={() => publish(it.id)}>Publish</button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
