// web/src/pages/host/Listings.tsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
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
  title: string;
  city?: string | null;
  country?: string | null;
  status?: "draft" | "published" | string | null;
  cover_url?: string | null;
};

export default function HostListings() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "published" | "draft">("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        setLoading(true);
        const data = await api("/api/host/listings").catch(() => []);
        if (on) setRows(Array.isArray(data) ? data : []);
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => { on = false; };
  }, []);

  const counts = useMemo(() => {
    const published = rows.filter(r => (r.status ?? "draft") === "published").length;
    const draft = rows.filter(r => (r.status ?? "draft") !== "published").length;
    return { all: rows.length, published, draft };
  }, [rows]);

  const filtered = useMemo(() => {
    let out = rows;
    if (tab === "published") out = out.filter(r => (r.status ?? "draft") === "published");
    if (tab === "draft") out = out.filter(r => (r.status ?? "draft") !== "published");
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      out = out.filter(r =>
        String(r.id).includes(s) ||
        (r.title ?? "").toLowerCase().includes(s) ||
        (([r.city, r.country].filter(Boolean).join(", ") || "").toLowerCase().includes(s))
      );
    }
    return out;
  }, [rows, tab, q]);

  /* ---------- Loading ---------- */
  if (loading) {
    return (
      <div className="hl wrap">
        <TopBar />
        <Controls tab={tab} setTab={setTab} q={q} setQ={setQ} counts={counts} />
        <ul className="cards">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="card panel skeleton">
              <div className="media sk" />
              <div className="body">
                <div className="skeleton line w200" />
                <div className="skeleton line w160" />
                <div className="skeleton line w120 h20" />
              </div>
            </li>
          ))}
        </ul>
        <Style />
      </div>
    );
  }

  /* ---------- Empty ---------- */
  if (!filtered.length) {
    return (
      <div className="hl wrap">
        <TopBar />
        <Controls tab={tab} setTab={setTab} q={q} setQ={setQ} counts={counts} />
        <div style={{ marginTop: 18 }}>
          <EmptyState
            title="No listings yet"
            body={rows.length ? "Nothing matches this filter/search." : "Create your first listing to start hosting."}
            actionHref="/host/new"
            actionText="Create listing"
          />
        </div>
        <Style />
      </div>
    );
  }

  /* ---------- List ---------- */
  return (
    <div className="hl wrap">
      <TopBar />
      <Controls tab={tab} setTab={setTab} q={q} setQ={setQ} counts={counts} />

      <ul className="cards">
        {filtered.map((r) => (
          <li key={r.id} className="card panel">
            <div className="media">
              {r.cover_url ? (
                <img src={r.cover_url} alt={r.title} loading="lazy" />
              ) : (
                <div className="ph">🏠</div>
              )}

              {/* ribbons */}
              <div className={`ribbon ${r.status === "published" ? "pub" : "drf"}`}>
                {r.status === "published" ? "Published" : "Draft"}
              </div>
              <div className="idpill">#{r.id}</div>
            </div>

            <div className="body">
              <div className="title">{r.title}</div>
              <div className="muted small">{[r.city, r.country].filter(Boolean).join(", ") || "—"}</div>

              <div className="actions">
                <Link
                  to={`/host/${r.id}/edit`}
                  className="btn primary"
                >
                  Edit
                </Link>
                <Link
                  to={`/listing/${r.id}`}
                  className="btn panelbtn"
                >
                  Preview
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <Style />
    </div>
  );
}

/* ---------- Pieces ---------- */

function TopBar() {
  return (
    <div className="toprow">
      <div>
        <h2 className="h-title">Host · Listings</h2>
        <p className="muted">Manage, edit, and preview your stays</p>
      </div>
      <div className="cta">
        <Link to="/" className="btn ghost">Home</Link>
        <Link to="/trips" className="btn panelbtn">My trips</Link>
        <Link to="/host/new" className="btn primary">Create listing</Link>
      </div>
    </div>
  );
}

function Controls({
  tab, setTab, q, setQ, counts
}:{
  tab: "all"|"published"|"draft"; setTab:(t:any)=>void; q:string; setQ:(v:string)=>void;
  counts: { all:number; published:number; draft:number };
}) {
  return (
    <div className="controls">
      <div className="seg">
        <button className={"segbtn " + (tab==="all" ? "active":"")} onClick={()=>setTab("all")}>
          All <span className="segcount">{counts.all}</span>
        </button>
        <button className={"segbtn " + (tab==="published" ? "active":"")} onClick={()=>setTab("published")}>
          Published <span className="segcount">{counts.published}</span>
        </button>
        <button className={"segbtn " + (tab==="draft" ? "active":"")} onClick={()=>setTab("draft")}>
          Draft <span className="segcount">{counts.draft}</span>
        </button>
      </div>

      <div className="search">
        <span className="mag">🔎</span>
        <input
          value={q}
          onChange={(e)=>setQ(e.target.value)}
          placeholder="Search by title, city, or #id…"
        />
      </div>
    </div>
  );
}

/* ---------- Styles (scoped) ---------- */

function Style() {
  return (
    <style>{`
      .wrap { max-width: 1152px; margin: 0 auto; color: ${TEXT}; }
      .muted { color: ${MUTED}; }
      .small { font-size: 12px; }

      .btn {
        display:inline-flex; align-items:center; justify-content:center;
        padding:10px 12px; border-radius:12px; border:1px solid ${BORDER};
        color:${TEXT}; text-decoration:none; transition: background .18s ease, color .18s ease, border-color .18s ease, transform .18s ease;
      }
      .btn.primary { background:${ACCENT}; color:#0b1220; border-color:${ACCENT_BORDER}; }
      .btn.primary:hover { filter:brightness(.98); transform: translateY(-1px); }
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

      .cards { margin-top: 14px; display:grid; gap:12px; grid-template-columns: repeat(3, minmax(0,1fr)); }
      .card { overflow:hidden; transition: border-color .18s ease, background .18s ease, box-shadow .18s ease, transform .18s ease; }
      .card:hover { border-color:${ACCENT_BORDER}; background:${PANEL2}; box-shadow:0 10px 24px rgba(0,0,0,.28); transform: translateY(-2px); }

      .media { position:relative; aspect-ratio: 16/10; overflow:hidden; border-bottom:1px solid ${BORDER}; background:${PANEL2}; }
      .media img { width:100%; height:100%; object-fit:cover; transform: scale(1); transition: transform .35s ease; display:block; }
      .card:hover .media img { transform: scale(1.04); }
      .media .ph { width:100%; height:100%; display:grid; place-items:center; font-size:34px; color:${MUTED}; }

      .ribbon {
        position:absolute; left:10px; top:10px; padding:4px 8px; border-radius:999px;
        background:${PANEL}; border:1px solid ${BORDER}; font-size:12px; text-transform:uppercase;
      }
      .ribbon.pub { color:#26d07c; border-color:rgba(38,208,124,.35); background:rgba(38,208,124,.08); }
      .ribbon.drf { color:#cbd5e1; border-color:rgba(148,163,184,.35); background:rgba(148,163,184,.08); }

      .idpill {
        position:absolute; right:10px; top:10px; padding:4px 8px; border-radius:10px;
        background:${PANEL}; border:1px solid ${BORDER}; font-variant-numeric: tabular-nums;
      }

      .body { padding:12px; display:grid; gap:6px; }
      .title { font-weight:700; }
      .actions { display:flex; gap:8px; margin-top:6px; }

      /* skeletons */
      .skeleton { position:relative; overflow:hidden; }
      .skeleton::after { content:""; position:absolute; inset:0; background:linear-gradient(90deg, transparent, rgba(255,255,255,.06), transparent); animation:shimmer 1.2s infinite; }
      .sk { background:rgba(148,163,184,.10); }
      .skeleton.line { height:14px; border-radius:8px; background:rgba(148,163,184,.10); margin-top:8px; }
      .skeleton.h20 { height:20px; }
      .skeleton.w120{width:120px;} .skeleton.w160{width:160px;} .skeleton.w200{width:200px;}
      @keyframes shimmer { 0%{ transform: translateX(-100%);} 100%{ transform: translateX(100%);} }

      @media (max-width: 1024px) {
        .cards { grid-template-columns: repeat(2, minmax(0,1fr)); }
      }
      @media (max-width: 640px) {
        .cards { grid-template-columns: 1fr; }
        .toprow { flex-direction:column; align-items:flex-start; }
      }
    `}</style>
  );
}
