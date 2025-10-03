// web/src/pages/trips/MyTrips.tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { fmtAnyAmount } from "../../lib/format";
import { useToast } from "../../components/Toast";
import EmptyState from "../../components/EmptyState";

const ACCENT = "#f0c75e";
const ACCENT_SOFT = "rgba(240,199,94,0.12)";
const ACCENT_BORDER = "rgba(240,199,94,0.30)";
const PANEL = "rgba(14,32,51,0.78)";
const PANEL2 = "rgba(14,32,51,0.62)";
const BORDER = "rgba(28,59,90,0.60)";
const TEXT = "#e9edf5";
const MUTED = "rgba(233,237,245,0.78)";

type Trip = {
  id: number;
  listing_id?: number;
  title: string;
  city?: string;
  start_date: string;
  end_date: string;
  guests: number;
  status: "pending" | "paid" | "canceled" | "expired" | "refunded";
  total_amount?: number; amount?: number; total_cents?: number; amount_cents?: number; currency?: string;
  cover_url?: string;
};

export default function MyTrips() {
  const { push } = useToast();
  const [rows, setRows] = useState<Trip[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { refresh(); }, []);
  async function refresh() {
    setLoading(true);
    try {
      const next = await api("/api/bookings/mine");
      setRows(next || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  const fmtDate = (d: string) =>
    new Date(d + "T12:00:00").toLocaleDateString("en-MY", {
      weekday: "short", day: "numeric", month: "short", year: "numeric"
    });
  const fmtRange = (a: string, b: string) => `${fmtDate(a)} → ${fmtDate(b)}`;

  function badgeClass(status: Trip["status"]) {
    const base = "badge";
    const map: Record<Trip["status"], string> = {
      pending:  "badge-amber",
      paid:     "badge-emerald",
      refunded: "badge-sky",
      canceled: "badge-slate",
      expired:  "badge-stone",
    };
    return `${base} ${map[status] ?? ""}`;
  }

  async function payNow(id: number) {
    setBusy(id);
    try {
      const { url } = await api(`/api/stripe/checkout?booking=${id}`, { method: "POST" });
      if (!url) throw new Error("No checkout URL");
      window.location.assign(url);
    } catch (e: any) {
      push(e?.message || "Failed to start checkout");
    } finally {
      setBusy(null);
    }
  }

  async function cancelBooking(id: number) {
    if (!confirm("Cancel this booking? Paid bookings will be refunded.")) return;
    setBusy(id);
    try {
      await api(`/api/bookings/${id}/cancel`, { method: "POST" });
      await refresh();
      push("Cancelled");
    } catch (e: any) {
      push(e?.message || "Cancel failed");
    } finally {
      setBusy(null);
    }
  }

  function Cover({ trip }: { trip: Trip }) {
    const href = trip.listing_id ? `/listing/${trip.listing_id}` : undefined;
    const media = trip.cover_url ? (
      <img src={trip.cover_url} alt={trip.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
    ) : (
      <div className="thumb-fallback">🏨</div>
    );
    const block = <div className="thumb">{media}</div>;
    return href ? <Link to={href} className="thumb-link">{block}</Link> : block;
  }

  /* ============================== RENDER ============================== */

  if (loading) {
    return (
      <div className="mytrips wrap">
        <HeaderBar />
        <ul className="list">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="card">
              <div className="left">
                <div className="thumb skeleton" />
              </div>
              <div className="mid">
                <div className="skeleton line w200" />
                <div className="skeleton line w260" />
                <div className="skeleton line w120" />
              </div>
              <div className="right">
                <div className="skeleton btn" />
                <div className="skeleton btn" />
              </div>
            </li>
          ))}
        </ul>
        <Style />
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="mytrips wrap">
        <HeaderBar />
        <div style={{ marginTop: 16 }}>
          <EmptyState
            title="No trips yet"
            body="When you book a stay, it will appear here."
            actionHref="/"
            actionText="Find a place"
          />
        </div>
        <Style />
      </div>
    );
  }

  return (
    <div className="mytrips wrap">
      <HeaderBar />
      <ul className="list">
        {rows.map((r) => (
          <li key={r.id} className="card">
            {/* left */}
            <div className="left">
              <Cover trip={r} />
            </div>

            {/* mid */}
            <div className="mid">
              <div className="toprow">
                <div className="title">
                  <span className="strong">#{r.id}</span> — {r.title}{r.city ? ` · ${r.city}` : ""}
                </div>
                <span className={badgeClass(r.status)}>{r.status}</span>
              </div>

              <div className="muted">{fmtRange(r.start_date, r.end_date)} · {r.guests} guest(s)</div>
              <div className="price">{fmtAnyAmount(r)}</div>

              {/* actions on mobile */}
              <div className="actions mobile">
                {r.status === "pending" && (
                  <>
                    <button
                      disabled={busy === r.id}
                      onClick={() => payNow(r.id)}
                      className="btn primary"
                    >
                      {busy === r.id ? "Opening…" : "Pay now"}
                    </button>
                    <button
                      disabled={busy === r.id}
                      onClick={() => cancelBooking(r.id)}
                      className="btn ghost"
                    >
                      Cancel
                    </button>
                  </>
                )}
                {r.status === "paid" && (
                  <button
                    disabled={busy === r.id}
                    onClick={() => cancelBooking(r.id)}
                    className="btn danger"
                  >
                    Cancel & Refund
                  </button>
                )}
                {r.listing_id && (
                  <Link to={`/listing/${r.listing_id}`} className="btn ghost">View listing</Link>
                )}
              </div>
            </div>

            {/* right (desktop) */}
            <div className="right">
              {r.status === "pending" && (
                <>
                  <button
                    disabled={busy === r.id}
                    onClick={() => payNow(r.id)}
                    className="btn primary"
                  >
                    {busy === r.id ? "Opening…" : "Pay now"}
                  </button>
                  <button
                    disabled={busy === r.id}
                    onClick={() => cancelBooking(r.id)}
                    className="btn ghost"
                  >
                    Cancel
                  </button>
                </>
              )}
              {r.status === "paid" && (
                <button
                  disabled={busy === r.id}
                  onClick={() => cancelBooking(r.id)}
                  className="btn danger"
                >
                  Cancel & Refund
                </button>
              )}
              {r.listing_id && (
                <Link to={`/listing/${r.listing_id}`} className="btn ghost">View listing</Link>
              )}
            </div>
          </li>
        ))}
      </ul>

      <Style />
    </div>
  );
}

/* ============================== HEADER ============================== */

function HeaderBar() {
  return (
    <div className="hdrrow">
      <div>
        <h2 className="title">My Trips</h2>
        <p className="sub">Your bookings, statuses & actions</p>
      </div>
      <div className="hdrlinks">
        <Link to="/" className="btn ghost">Browse stays →</Link>
        <Link to="/host/bookings" className="btn panel">Host bookings</Link>
      </div>
    </div>
  );
}

/* ============================== SCOPED CSS ============================== */

function Style() {
  return (
    <style>{`
    .wrap { max-width: 1152px; margin: 0 auto; }
    .mytrips { color: ${TEXT}; }
    .title { font-size: 28px; font-weight: 800; letter-spacing: .2px; }
    .sub { color: ${MUTED}; margin-top: 4px; }
    .hdrrow { display:flex; align-items:flex-end; justify-content:space-between; gap:12px; }
    .hdrlinks { display:flex; gap:8px; }
    .btn {
      display:inline-flex; align-items:center; justify-content:center;
      padding: 10px 12px; border-radius: 12px; border: 1px solid ${BORDER};
      background: transparent; color: ${TEXT}; text-decoration:none; cursor:pointer;
      transition: background .18s ease, color .18s ease, border-color .18s ease, opacity .18s ease;
      user-select:none;
    }
    .btn:disabled { opacity:.6; cursor:not-allowed; }
    .btn.primary { background: ${ACCENT}; color: #0b1220; border-color: ${ACCENT_BORDER}; }
    .btn.primary:hover { filter: brightness(0.98); }
    .btn.ghost:hover { background: ${ACCENT_SOFT}; color: ${ACCENT}; border-color: ${ACCENT_BORDER}; }
    .btn.panel { background:${PANEL}; }
    .btn.danger { background: rgba(239,68,68,.9); border-color: rgba(239,68,68,.4); }
    .btn.danger:hover { background: rgba(239,68,68,1); }

    /* list + card */
    .list { list-style:none; padding:0; margin:16px 0 0 0; display:grid; gap:12px; }
    .card {
      display:flex; gap:14px; align-items:stretch;
      padding:12px; border-radius:16px;
      background:${PANEL};
      border:1px solid ${BORDER};
      transition: border-color .18s ease, box-shadow .18s ease, background .18s ease;
    }
    .card:hover { border-color:${ACCENT_BORDER}; box-shadow:0 12px 28px rgba(0,0,0,0.25); background:${PANEL2}; }

    .left { width: 240px; flex:0 0 auto; }
    .thumb { aspect-ratio: 16 / 10; width:100%; border-radius:12px; overflow:hidden; background:${PANEL2}; border:1px solid ${BORDER}; }
    .thumb-link { display:block; height:100%; }
    .thumb-fallback { width:100%; height:100%; display:grid; place-items:center; color:#b7c0cc; font-size:28px; }

    .mid { flex:1 1 auto; min-width:0; display:flex; flex-direction:column; gap:6px; }
    .toprow { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
    .strong { font-weight:700; }
    .muted { color:${MUTED}; font-size: 14px; }
    .price { color:${ACCENT}; font-weight:700; margin-top:2px; }

    .right { width: 220px; flex:0 0 auto; display:flex; flex-direction:column; gap:8px; align-items:flex-end; justify-content:center; }
    .actions.mobile { display:none; gap:8px; margin-top:8px; }

    /* badges */
    .badge { border:1px solid ${BORDER}; background:${PANEL2}; padding:4px 8px; border-radius:999px; font-size:12px; text-transform:uppercase; }
    .badge-amber { color:#ffd189; border-color:rgba(255,209,137,.35); background:rgba(255,209,137,.10); }
    .badge-emerald { color:#26d07c; border-color:rgba(38,208,124,.35); background:rgba(38,208,124,.10); }
    .badge-sky { color:#62c3d2; border-color:rgba(98,195,210,.35); background:rgba(98,195,210,.10); }
    .badge-slate { color:#cbd5e1; border-color:rgba(148,163,184,.35); background:rgba(148,163,184,.08); }
    .badge-stone { color:#e5e7eb; border-color:rgba(229,231,235,.28); background:rgba(229,231,235,.06); }

    /* skeletons */
    .skeleton { position:relative; overflow:hidden; background:rgba(148,163,184,.10); border-radius:12px; }
    .skeleton::after { content:""; position:absolute; inset:0; background:linear-gradient(90deg, transparent, rgba(255,255,255,.06), transparent); animation:shimmer 1.2s infinite; }
    .skeleton.line { height:14px; border-radius:6px; }
    .skeleton.w200 { width:200px; }
    .skeleton.w260 { width:260px; }
    .skeleton.w120 { width:120px; }
    .skeleton.btn { height:38px; }
    @keyframes shimmer { 0%{ transform: translateX(-100%);} 100%{ transform: translateX(100%);} }

    /* responsive */
    @media (max-width: 900px) {
      .left { width: 200px; }
      .right { width: 200px; }
    }
    @media (max-width: 760px) {
      .card { flex-direction:column; }
      .left { width:100%; }
      .right { display:none; }
      .actions.mobile { display:flex; flex-wrap:wrap; }
    }
  `}</style>
  );
}
