// web/src/pages/host/Dashboard.tsx
import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { fmtRM, fmtAnyAmount } from "../../lib/format";

const ACCENT = "#f0c75e";
const ACCENT_BORDER = "rgba(240,199,94,0.30)";
const PANEL = "rgba(14,32,51,0.78)";
const PANEL2 = "rgba(14,32,51,0.62)";
const BORDER = "rgba(28,59,90,0.60)";
const TEXT = "#e9edf5";
const MUTED = "rgba(233,237,245,0.78)";

type Booking = {
  id: number;
  start_date: string;
  end_date: string;
  status: "pending" | "paid" | "canceled" | "expired" | "refunded";
  total_amount?: number; amount?: number; total_cents?: number; amount_cents?: number; currency?: string;
};

export default function HostDashboard() {
  const [rows, setRows] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await api("/api/host/bookings");
        setRows(data || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const todayStr = new Date().toISOString().slice(0, 10);
  const now = Date.now();
  const d30Ago = new Date(now - 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10);

  const stats = useMemo(() => {
    const upcoming = rows.filter(r => r.end_date >= todayStr);
    const paidLast30 = rows.filter(r => r.status === "paid" && r.start_date >= d30Ago);
    const pending = rows.filter(r => r.status === "pending" && r.end_date >= todayStr);

    const toUnits = (b: Booking) => {
      if (b.total_cents != null) return Number(b.total_cents) / 100;
      if (b.amount_cents != null) return Number(b.amount_cents) / 100;
      if (b.total_amount != null) return Number(b.total_amount);
      if (b.amount != null) return Number(b.amount);
      return 0;
    };

    const gross30 = paidLast30.reduce((n, b) => n + toUnits(b), 0);
    const avg30 = paidLast30.length ? gross30 / paidLast30.length : 0;

    // build last-30-days revenue series by start_date
    const days: string[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 86400000).toISOString().slice(0, 10);
      days.push(d);
    }
    const map = new Map<string, number>();
    for (const d of days) map.set(d, 0);
    for (const b of paidLast30) {
      map.set(b.start_date, (map.get(b.start_date) || 0) + toUnits(b));
    }
    const series = days.map(d => map.get(d) || 0);

    return {
      upcomingCount: upcoming.length,
      pendingCount: pending.length,
      gross30d: fmtRM(gross30),
      avg30d: fmtRM(avg30),
      series,
      sample: rows.slice(0, 6),
    };
  }, [rows, todayStr, d30Ago, now]);

  if (loading) {
    return (
      <div className="hostdash wrap">
        <TopBar />

        <div className="tiles">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="tile skeleton">
              <div className="skeleton line w120" />
              <div className="skeleton line w80 h24" />
            </div>
          ))}
        </div>

        <div className="panel chart">
          <div className="chart-head">
            <div className="chart-title">Revenue (last 30 days)</div>
          </div>
          <div className="skeleton chartbox" />
        </div>

        <div className="listgrid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="panel item skeleton">
              <div className="skeleton line w200" />
              <div className="skeleton line w240" />
              <div className="skeleton line w100" />
            </div>
          ))}
        </div>

        <Actions />
        <Style />
      </div>
    );
  }

  return (
    <div className="hostdash wrap">
      <TopBar />

      {/* KPI tiles */}
      <div className="tiles">
        <Tile label="Upcoming bookings" value={String(stats.upcomingCount)} />
        <Tile label="Pending right now" value={String(stats.pendingCount)} />
        <Tile label="Gross (last 30d)" value={stats.gross30d} />
        <Tile label="Avg booking (30d)" value={stats.avg30d} />
      </div>

      {/* Revenue sparkline */}
      <div className="panel chart">
        <div className="chart-head">
          <div className="chart-title">Revenue (last 30 days)</div>
          <div className="chart-legend">
            <span className="dot" /> RM/day
          </div>
        </div>
        <Sparkline data={stats.series} />
      </div>

      {/* Recent activity */}
      <h3 className="sectiontitle">Recent activity</h3>
      <div className="listgrid">
        {stats.sample.map((b) => (
          <div key={b.id} className="panel item">
            <div className="itemtop">
              <div className="itemtitle">
                <span className="muted">Booking</span> <strong>#{b.id}</strong>
              </div>
              <span className={badgeClass(b.status)}>{b.status}</span>
            </div>
            <div className="muted">{b.start_date} → {b.end_date}</div>
            <div className="amount">{fmtAnyAmount(b)}</div>
          </div>
        ))}
      </div>

      <Actions />
      <Style />
    </div>
  );
}

/* ============== subcomponents ============== */

function TopBar() {
  return (
    <div className="topbar panel">
      <div>
        <div className="eyebrow">Host overview</div>
        <h2 className="pagetitle">Dashboard</h2>
      </div>
      <div className="hello">Welcome back 👋</div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile panel">
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
    </div>
  );
}

function Actions() {
  return (
    <div className="actions">
      <a
        href="/host/bookings"
        className="btn ghost"
      >
        View bookings →
      </a>
      <a
        href="/host/new"
        className="btn panelbtn"
      >
        Create listing
      </a>
      <a
        href="/host/listings"
        className="btn primary"
      >
        Manage listings
      </a>
    </div>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const width = 720; // will scale to container via CSS
  const height = 120;
  const max = Math.max(1, ...data);
  const stepX = width / Math.max(1, data.length - 1);
  const pts = data.map((v, i) => {
    const x = i * stepX;
    const y = height - (v / max) * (height - 6) - 3;
    return `${x},${y}`;
  }).join(" ");

  // gradient fill area
  const pathD = data.map((v, i) => {
    const x = i * stepX;
    const y = height - (v / max) * (height - 6) - 3;
    return `${i === 0 ? "M" : "L"} ${x} ${y}`;
  }).join(" ") + ` L ${width} ${height} L 0 ${height} Z`;

  return (
    <div className="chartbox">
      {data.every(v => v === 0) ? (
        <div className="muted" style={{ padding: 16 }}>No paid bookings in the last 30 days.</div>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} className="spark">
          <defs>
            <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity="0.35" />
              <stop offset="100%" stopColor={ACCENT} stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <path d={pathD} fill="url(#g)" />
          <polyline points={pts} fill="none" stroke={ACCENT} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      )}
    </div>
  );
}

function badgeClass(status: Booking["status"]) {
  const base = "badge";
  const map: Record<Booking["status"], string> = {
    pending:  "badge-amber",
    paid:     "badge-emerald",
    refunded: "badge-sky",
    canceled: "badge-slate",
    expired:  "badge-stone",
  };
  return `${base} ${map[status] ?? ""}`;
}

/* ============== scoped styles ============== */

function Style() {
  return (
    <style>{`
      .wrap { max-width: 1152px; margin: 0 auto; color: ${TEXT}; }
      .muted { color: ${MUTED}; }
      .panel {
        background: ${PANEL};
        border: 1px solid ${BORDER};
        border-radius: 16px;
      }

      .topbar { padding: 14px 16px; display:flex; align-items:flex-end; justify-content:space-between; gap:12px; }
      .pagetitle { margin: 2px 0 0; font-size: 28px; font-weight: 800; letter-spacing: .2px; }
      .eyebrow { font-size: 12px; color: ${MUTED}; text-transform: uppercase; letter-spacing: .12em; }
      .hello { color: ${MUTED}; font-size: 14px; }

      .tiles {
        margin-top: 14px;
        display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 12px;
      }
      .tile { padding: 14px; transition: border-color .18s ease, background .18s ease, box-shadow .18s ease; }
      .tile:hover { border-color: ${ACCENT_BORDER}; background: ${PANEL2}; box-shadow: 0 8px 20px rgba(0,0,0,.25); }
      .tile-label { color: ${MUTED}; font-size: 13px; }
      .tile-value { margin-top: 4px; font-size: 24px; font-weight: 700; }

      .chart { margin-top: 14px; }
      .chart-head { display:flex; align-items:center; justify-content:space-between; padding: 12px 12px 0 12px; }
      .chart-title { font-weight: 600; }
      .chart-legend { color:${MUTED}; font-size: 12px; display:flex; align-items:center; gap:6px; }
      .dot { width:10px; height:10px; border-radius:999px; background:${ACCENT}; display:inline-block; }
      .chartbox { width:100%; height:150px; padding: 8px 12px 12px; }
      .spark { width:100%; height:100%; display:block; }

      .sectiontitle { margin: 18px 0 8px; font-size: 18px; font-weight: 700; }

      .listgrid { display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; }
      .item { padding: 12px; transition: border-color .18s ease, background .18s ease, box-shadow .18s ease; }
      .item:hover { border-color: ${ACCENT_BORDER}; background: ${PANEL2}; box-shadow: 0 8px 20px rgba(0,0,0,.25); }
      .itemtop { display:flex; align-items:center; justify-content:space-between; gap: 10px; }
      .itemtitle { font-weight:600; }
      .amount { margin-top: 4px; color: ${ACCENT}; font-weight: 700; }

      .actions { display:flex; gap: 8px; margin-top: 16px; }
      .btn {
        display:inline-flex; align-items:center; justify-content:center;
        padding:10px 12px; border-radius:12px; border:1px solid ${BORDER};
        color:${TEXT}; text-decoration:none; transition: background .18s ease, color .18s ease, border-color .18s ease;
      }
      .btn.primary { background:${ACCENT}; color:#0b1220; border-color:${ACCENT_BORDER}; }
      .btn.primary:hover { filter:brightness(.98); }
      .btn.panelbtn { background:${PANEL}; }
      .btn.ghost:hover { background: rgba(240,199,94,.12); border-color:${ACCENT_BORDER}; color:${ACCENT}; }

      .badge { border:1px solid ${BORDER}; background:${PANEL2}; padding:4px 8px; border-radius:999px; font-size:12px; text-transform:uppercase; }
      .badge-amber { color:#ffd189; border-color:rgba(255,209,137,.35); background:rgba(255,209,137,.10); }
      .badge-emerald { color:#26d07c; border-color:rgba(38,208,124,.35); background:rgba(38,208,124,.10); }
      .badge-sky { color:#62c3d2; border-color:rgba(98,195,210,.35); background:rgba(98,195,210,.10); }
      .badge-slate { color:#cbd5e1; border-color:rgba(148,163,184,.35); background:rgba(148,163,184,.08); }
      .badge-stone { color:#e5e7eb; border-color:rgba(229,231,235,.28); background:rgba(229,231,235,.06); }

      /* skeletons */
      .skeleton { position:relative; overflow:hidden; }
      .skeleton::after { content:""; position:absolute; inset:0; background:linear-gradient(90deg, transparent, rgba(255,255,255,.06), transparent); animation:shimmer 1.2s infinite; }
      .skeleton.line { height:14px; border-radius:6px; background:rgba(148,163,184,.10); }
      .skeleton.h24 { height:24px; }
      .skeleton.w80 { width:80px; } .skeleton.w100 { width:100px; } .skeleton.w120 { width:120px; } .skeleton.w200 { width:200px; } .skeleton.w240 { width:240px; }
      @keyframes shimmer { 0%{ transform: translateX(-100%);} 100%{ transform: translateX(100%);} }

      @media (max-width: 1020px) {
        .tiles { grid-template-columns: repeat(2, minmax(0,1fr)); }
        .listgrid { grid-template-columns: 1fr; }
      }
      @media (max-width: 640px) {
        .topbar { flex-direction:column; align-items:flex-start; }
      }
    `}</style>
  );
}
