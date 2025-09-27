import { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function HostBookings() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { api("/api/bookings/host/all").then(setRows).catch(() => setRows([])); }, []);
  return (
    <div style={{ padding: 24 }}>
      <h2>Host Bookings</h2>
      <ul style={{ display: "grid", gap: 12, marginTop: 12 }}>
        {rows.map(r => (
          <li key={r.id} style={{ padding: 12, border: "1px solid #1c3b5a", borderRadius: 8 }}>
            <div>#{r.id} — Listing {r.listing_id} · {r.start_date} → {r.end_date} · {r.status}</div>
            <div>RM {Number(r.total_amount).toFixed(2)} {String(r.currency || "").toUpperCase()}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
