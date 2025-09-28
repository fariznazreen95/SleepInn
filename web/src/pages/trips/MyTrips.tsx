// web/src/pages/trips/MyTrips.tsx
import { useEffect, useState } from "react";
import { api } from "../../lib/api";

type Trip = {
  id: number;
  title: string;
  city: string;
  start_date: string;
  end_date: string;
  guests: number;
  status: "pending" | "paid" | "canceled" | "expired" | "refunded";
  total_amount?: number;
};

export default function MyTrips() {
  const [rows, setRows] = useState<Trip[]>([]);
  const [busy, setBusy] = useState<number | null>(null);

  async function refresh() {
    const next = await api("/api/bookings/mine");
    setRows(next);
  }

  useEffect(() => { refresh().catch(() => setRows([])); }, []);

  async function payNow(id: number) {
    setBusy(id);
    try {
      const { url } = await api(`/api/stripe/checkout?booking=${id}`, { method: "POST" });
      if (!url) throw new Error("No checkout URL");
      window.location.assign(url);
    } finally {
      setBusy(null);
    }
  }

  async function cancelBooking(id: number) {
    if (!confirm("Cancel this booking? Paid bookings will be refunded.")) return;
    try {
      setBusy(id);
      await api(`/api/bookings/${id}/cancel`, { method: "POST" });
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h2 className="text-2xl font-semibold">My Trips</h2>
      <ul className="mt-4 grid gap-3">
        {rows.map((r) => (
          <li key={r.id} className="border border-slate-600/50 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">#{r.id} — {r.title} · {r.city}</div>
                <div className="text-sm text-slate-300">
                  {r.start_date} → {r.end_date} · {r.guests} guest(s) · <b className="uppercase">{r.status}</b>
                </div>
                {"total_amount" in r && r.total_amount != null && (
                  <div className="text-sm mt-1">RM {Number(r.total_amount).toFixed(2)}</div>
                )}
              </div>

              <div className="flex gap-2">
                {r.status === "pending" && (
                  <>
                    <button
                      disabled={busy === r.id}
                      onClick={() => payNow(r.id)}
                      className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50"
                    >
                      {busy === r.id ? "Opening…" : "Pay now"}
                    </button>
                    <button
                      disabled={busy === r.id}
                      onClick={() => cancelBooking(r.id)}
                      className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </>
                )}

                {r.status === "paid" && (
                  <button
                    disabled={busy === r.id}
                    onClick={() => cancelBooking(r.id)}
                    className="px-3 py-1 rounded bg-red-600 hover:bg-red-500 disabled:opacity-50"
                  >
                    Cancel & Refund
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="text-slate-400">No trips yet.</li>
        )}
      </ul>
    </div>
  );
}
