import { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function MyTrips() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { api("/api/bookings/mine").then(setRows).catch(() => setRows([])); }, []);
  return (
    <div style={{ padding: 24 }}>
      <h2>My Trips</h2>
      <ul style={{ display: "grid", gap: 12, marginTop: 12 }}>
        {rows.map(r => (
          <li key={r.id} style={{ padding: 12, border: "1px solid #1c3b5a", borderRadius: 8 }}>
            <div><strong>#{r.id}</strong> {r.title} — {r.city}</div>
            <div>{r.start_date} → {r.end_date} · {r.guests} guest(s) · {r.status}</div>
            <div>RM {Number(r.total_amount).toFixed(2)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
