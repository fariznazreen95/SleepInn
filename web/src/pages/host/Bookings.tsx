// web/src/pages/host/Bookings.tsx
import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { fmtAnyAmount } from "../../lib/format";
import { useToast } from "../../components/Toast";
import EmptyState from "../../components/EmptyState";

const ACCENT = "#f0c75e";
const ACCENT_BORDER = "rgba(240,199,94,0.30)";
const PANEL = "rgba(14,32,51,0.78)";
const PANEL2 = "rgba(14,32,51,0.62)";
const BORDER = "rgba(28,59,90,0.60)";
const TEXT = "#e9edf5";
const MUTED = "rgba(233,237,245,0.78)";

type Row = {
  id: number;
  title?: string;
  guest_name?: string;
  start_date: string;
  end_date: string;
  status: "pending" | "paid" | "canceled" | "expired" | "refunded";
  total_amount?: number; amount?: number; total_cents?: number; amount_cents?: number; currency?: string;
};

export default function HostBookings() {
  const { push } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"upcoming" | "past" | "all">("upcoming");
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await api("/api/host/bookings");
        setRows(data || []);
      } catch {
        push("Failed to load host bookings");
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [push]);

  const today = new Date().toISOString().slice(0, 10);
  const fmtDate = (d: string) =>
    new Date(d + "T12:00:00").toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const fmtRange = (a: string, b: string) => `${fmtDate(a)} → ${fmtDate(b)}`;

  function badgeClass(status: Row["status"]) {
    const base = "badge";
    const map: Record<Row["status"], string> = {
      pending:  "badge-amber",
      paid:     "badge-emerald",
      refunded: "badge-sky",
      canceled: "badge-slate",
      expired:  "badge-stone",
    };
    return `${base} ${map[status] ?? ""}`;
  }

  const counts = useMemo(() => {
    const upcoming = rows.filter(r => r.end_date >= today).length;
    const past = rows.filter(r => r.end_date < today).length;
    return { upcoming, past, all: rows.length };
  }, [rows, today]);

  const filtered = useMemo(() => {
    let out = rows;
    if (tab === "upcoming") out = out.filter(r => r.end_date >= today);
    if (tab === "past") out = out.filter(r => r.end_date < today);
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      out = out.filter(r =>
        String(r.id).includes(s) ||
        (r.title ?? "").toLowerCase().includes(s) ||
        (r.guest_name ?? "").toLowerCase().includes(s)
      );
    }
    return out;
  }, [rows, tab, q, today]);

  /* ------------------ Loading ------------------ */
  if (loading) {
    return (
      <div className="hb wrap">
        <Header />
        <Controls tab={tab} setTab={setTab} q={q} setQ={setQ} counts={counts} />
        <div className="table panel">
          <div className="thead">
            <div className="th id">ID</div>
            <div className="th title">Listing & guest</div>
            <div className="th dates">Dates</div>
            <div className="th status">Status</div>
            <div className="th amt">Amount</div>
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div className="tr" key={i}>
              <div className="td"><div className="skeleton line w60" /></div>
              <div className="td"><div className="skeleton line w220" /></div>
              <div className="td"><div className="skeleton line w160" /></div>
              <div className="td"><div className="skeleton line w80" /></div>
              <div className="td"><div className="skeleton line w90" /></div>
            </div>
          ))}
        </div>
        <Style />
      </div>
    );
  }

  /* ------------------ Empty ------------------ */
  if (filtered.length === 0) {
    return (
      <div className="hb wrap">
        <Header />
        <Controls tab={tab} setTab={setTab} q={q} setQ={setQ} counts={counts} />
        <div style={{ marginTop: 16 }}>
          <EmptyState
            title="No bookings"
            body="You have no bookings in this view. Try switching tabs or clearing the search."
            actionHref="/host/new"
            actionText="Create listing"
          />
        </div>
        <Style />
      </div>
    );
  }

  /* ------------------ List ------------------ */
  return (
    <div className="hb wrap">
      <Header />
      <Controls tab={tab} setTab={setTab} q={q} setQ={setQ} counts={counts} />

      <div className="table panel">
        <div className="thead">
          <div className="th id">ID</div>
          <div className="th title">Listing & guest</div>
          <div className="th dates">Dates</div>
          <div className="th status">Status</div>
          <div className="th amt">Amount</div>
        </div>

        {filtered.map((r, idx) => (
          <div className={"tr " + (idx % 2 ? "alt" : "")} key={r.id}>
            <div className="td idcell">
              <div className="mono">#{r.id}</div>
            </div>

            <div className="td">
              <div className="titlecell">
                <div className="strong">{r.title ?? "Listing"}</div>
                <div className="muted small">Guest: {r.guest_name ?? "—"}</div>
              </div>
            </div>

            <div className="td">
              <div className="muted">{fmtRange(r.start_date, r.end_date)}</div>
            </div>

            <div className="td">
              <span className={badgeClass(r.status)}>{r.status}</span>
            </div>

            <div className="td amtcell">
              <span className="amount">{fmtAnyAmount(r)}</span>
            </div>

            {/* mobile reveal labels */}
            <div className="mobile-meta">
              <div><span className="lbl">Dates</span> {fmtRange(r.start_date, r.end_date)}</div>
              <div><span className="lbl">Amount</span> <span className="amount">{fmtAnyAmount(r)}</span></div>
            </div>
          </div>
        ))}
      </div>

      <FooterActions />
      <Style />
    </div>
  );
}

/* ------------------ Pieces ------------------ */

function Header() {
  return (
    <div className="toprow">
      <div>
        <h2 className="h-title">Host · Bookings</h2>
        <p className="muted">Filter, search, and review</p>
      </div>
      <div className="cta">
        <a href="/" className="btn ghost">Home</a>
        <a href="/trips" className="btn panelbtn">My trips</a>
        <a href="/host/new" className="btn primary">Create listing</a>
      </div>
    </div>
  );
}

function Controls({
  tab, setTab, q, setQ, counts
}:{
  tab: "upcoming" | "past" | "all";
  setTab:(t:any)=>void;
  q:string; setQ:(v:string)=>void;
  counts:{upcoming:number; past:number; all:number};
}) {
  return (
    <div className="controls">
      <div className="seg">
        <button className={"segbtn " + (tab==="upcoming" ? "active" : "")} onClick={()=>setTab("upcoming")}>
          Upcoming <span className="segcount">{counts.upcoming}</span>
        </button>
        <button className={"segbtn " + (tab==="past" ? "active" : "")} onClick={()=>setTab("past")}>
          Past <span className="segcount">{counts.past}</span>
        </button>
        <button className={"segbtn " + (tab==="all" ? "active" : "")} onClick={()=>setTab("all")}>
          All <span className="segcount">{counts.all}</span>
        </button>
      </div>

      <div className="search">
        <span className="mag">🔎</span>
        <input
          value={q}
          onChange={(e)=>setQ(e.target.value)}
          placeholder="Search by id, title, or guest…"
        />
      </div>
    </div>
  );
}

function FooterActions() {
  return (
    <div className="footeracts">
      <a href="/host/bookings" className="btn ghost">Refresh</a>
      <a href="/host/new" className="btn panelbtn">Create listing</a>
      <a href="/host/listings" className="btn primary">Manage listings</a>
    </div>
  );
}

/* ------------------ Styles ------------------ */

function Style() {
  return (
    <style>{`
      .wrap { max-width: 1152px; margin: 0 auto; color: ${TEXT}; }
      .muted { color: ${MUTED}; }
      .small { font-size: 12px; }

      .btn {
        display:inline-flex; align-items:center; justify-content:center;
        padding:10px 12px; border-radius:12px; border:1px solid ${BORDER};
        color:${TEXT}; text-decoration:none; transition: background .18s ease, color .18s ease, border-color .18s ease;
      }
      .btn.primary { background:${ACCENT}; color:#0b1220; border-color:${ACCENT_BORDER}; }
      .btn.primary:hover { filter:brightness(.98); }
      .btn.panelbtn { background:${PANEL}; }
      .btn.ghost:hover { background: rgba(240,199,94,.12); border-color:${ACCENT_BORDER}; color:${ACCENT}; }

      .toprow { display:flex; align-items:flex-end; justify-content:space-between; gap:12px; }
      .h-title { font-size:28px; font-weight:800; letter-spacing:.2px; margin-bottom:2px; }
      .cta { display:flex; gap:8px; }

      .controls { margin-top: 12px; display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
      .seg { display:inline-flex; background:${PANEL}; border:1px solid ${BORDER}; border-radius:12px; padding:4px; gap:4px; }
      .segbtn {
        padding:8px 12px; border-radius:10px; border:1px solid transparent; background:transparent; color:${TEXT}; cursor:pointer;
        transition: background .18s ease, color .18s ease, border-color .18s ease;
      }
      .segbtn.active { background:${ACCENT}1f; color:${ACCENT}; border-color:${ACCENT_BORDER}; }
      .segcount { margin-left:6px; padding:2px 6px; border-radius:999px; background:${PANEL2}; border:1px solid ${BORDER}; font-size:11px; }
      .search { margin-left:auto; position:relative; }
      .search .mag { position:absolute; left:10px; top:50%; transform:translateY(-50%); opacity:.8; }
      .search input {
        background: rgba(10,20,32,.62); border:1px solid ${BORDER}; color:${TEXT};
        padding:9px 12px 9px 32px; border-radius:12px; width:280px;
      }

      .panel { background:${PANEL}; border:1px solid ${BORDER}; border-radius:16px; }
      .table { margin-top:12px; overflow:hidden; }
      .thead {
        display:grid; grid-template-columns: 120px 1.6fr 1fr 140px 140px;
        padding:10px 12px; font-size:12px; color:${MUTED}; background:${PANEL2}; border-bottom:1px solid ${BORDER};
      }
      .th { padding:4px 6px; }
      .th.id { font-variant-numeric: tabular-nums; }

      .tr {
        display:grid; grid-template-columns: 120px 1.6fr 1fr 140px 140px;
        align-items:center; padding:10px 12px; gap:6px;
        border-bottom:1px solid ${BORDER}; transition: background .18s ease, border-color .18s ease;
      }
      .tr.alt { background: rgba(255,255,255,0.02); }
      .tr:hover { background: ${PANEL2}; border-color:${ACCENT_BORDER}; }

      .td { min-width:0; }
      .idcell .mono { font-variant-numeric: tabular-nums; }
      .titlecell .strong { font-weight:600; }
      .amtcell { text-align:right; }
      .amount { color:${ACCENT}; font-weight:700; }

      .badge { border:1px solid ${BORDER}; background:${PANEL2}; padding:4px 8px; border-radius:999px; font-size:12px; text-transform:uppercase; }
      .badge-amber { color:#ffd189; border-color:rgba(255,209,137,.35); background:rgba(255,209,137,.10); }
      .badge-emerald { color:#26d07c; border-color:rgba(38,208,124,.35); background:rgba(38,208,124,.10); }
      .badge-sky { color:#62c3d2; border-color:rgba(98,195,210,.35); background:rgba(98,195,210,.10); }
      .badge-slate { color:#cbd5e1; border-color:rgba(148,163,184,.35); background:rgba(148,163,184,.08); }
      .badge-stone { color:#e5e7eb; border-color:rgba(229,231,235,.28); background:rgba(229,231,235,.06); }

      .footeracts { display:flex; gap:8px; margin-top:14px; }

      /* skeletons */
      .skeleton { position:relative; overflow:hidden; background:rgba(148,163,184,.10); border-radius:8px; height:14px; }
      .skeleton::after { content:""; position:absolute; inset:0; background:linear-gradient(90deg, transparent, rgba(255,255,255,.06), transparent); animation:shimmer 1.2s infinite; }
      .skeleton.w60{width:60px;} .skeleton.w80{width:80px;} .skeleton.w90{width:90px;} .skeleton.w160{width:160px;} .skeleton.w220{width:220px;}
      @keyframes shimmer { 0%{ transform: translateX(-100%);} 100%{ transform: translateX(100%);} }

      /* responsive -> stack rows into cards */
      .mobile-meta { display:none; }
      @media (max-width: 880px) {
        .thead { display:none; }
        .tr, .tr.alt { grid-template-columns: 1fr; gap:8px; padding:12px; }
        .amtcell { text-align:left; }
        .mobile-meta { display:grid; gap:4px; color:${MUTED}; }
        .mobile-meta .lbl { color:${MUTED}; margin-right:6px; }
      }
    `}</style>
  );
}
