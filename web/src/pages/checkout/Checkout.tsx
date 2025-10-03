import { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { api } from "../../lib/api";

type State =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "conflict"; message: string }
  | { kind: "error"; message: string };

export default function Checkout() {
  const [params] = useSearchParams();
  const [state, setState] = useState<State>({ kind: "idle" });

  const input = useMemo(() => {
    const listingId = Number(params.get("listingId"));
    const start = params.get("start") || "";
    const end = params.get("end") || "";
    const guests = Number(params.get("guests") || "1");
    return { listingId, start, end, guests };
  }, [params]);

  const fmtDate = (d: string) =>
    d ? new Date(d + "T12:00:00").toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "";

  useEffect(() => {
    const key = `${input.listingId}|${input.start}|${input.end}|${input.guests}`;
    const once: Set<string> = ((window as any).__checkoutOnce ??= new Set<string>());

    if (!input.listingId || !input.start || !input.end) {
      setState({ kind: "error", message: "Missing or invalid checkout parameters." });
      return;
    }
    if (once.has(key)) return;
    once.add(key);

    (async () => {
      try {
        setState({ kind: "working" });

        // 1) Create booking
        const b = await api("/api/bookings", {
          method: "POST",
          body: JSON.stringify({
            listingId: input.listingId,
            start: input.start,
            end: input.end,
            guests: input.guests,
          }),
        });

        if (!b || typeof b !== "object" || b.id == null) {
          const msg = (b && (b.error || b.message)) || "Dates are no longer available.";
          throw new Error(msg);
        }

        // 2) Launch Stripe Checkout (dev may return success url)
        const s = await api(`/api/stripe/checkout/${b.id}`, { method: "POST" });
        if (s && s.url) {
          window.location.assign(s.url);
          return;
        }
        if (s && (s.error || s.message)) {
          throw new Error(s.error || s.message);
        }
        // Fallback (dev): land on success page
        window.location.assign(`/checkout/success?booking=${b.id}`);
      } catch (e: any) {
        const msg = String(e?.message || "Something went wrong");
        if (/Dates are no longer available/i.test(msg)) {
          setState({ kind: "conflict", message: msg });
        } else {
          setState({ kind: "error", message: msg });
        }
      }
    })();
  }, [input]);

  const Summary = (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-900/40 p-4">
      <div className="text-sm text-slate-300">You’re booking</div>
      <div className="mt-1 font-medium">Listing #{input.listingId}</div>
      <div className="text-sm text-slate-300">
        {fmtDate(input.start)} → {fmtDate(input.end)} · {input.guests} guest(s)
      </div>
    </div>
  );

  if (state.kind === "conflict") {
    const backToListing = `/listing/${input.listingId}?start=${encodeURIComponent(
      input.start
    )}&end=${encodeURIComponent(input.end)}&guests=${input.guests}`;
    return (
      <div className="max-w-lg mx-auto">
        <div className="rounded-2xl border border-slate-700/50 bg-slate-900/40 p-6">
          <h2 className="text-xl font-semibold mb-2">Those dates just got snapped 😬</h2>
          <p className="text-slate-300 mb-4">{state.message}</p>
          {Summary}
          <div className="mt-6 flex gap-2">
            <Link to={backToListing} className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm">
              Change dates
            </Link>
            <Link to="/" className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm">
              Search again →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="max-w-lg mx-auto">
        <div className="rounded-2xl border border-slate-700/50 bg-slate-900/40 p-6">
          <h2 className="text-xl font-semibold mb-2">Checkout failed</h2>
          <p className="text-slate-300 mb-4">{state.message}</p>
          {Summary}
          <div className="mt-6">
            <Link to="/" className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm">
              Return home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // working / idle
  return (
    <div className="max-w-lg mx-auto">
      <div className="rounded-2xl border border-slate-700/50 bg-slate-900/40 p-6">
        <h2 className="text-xl font-semibold mb-2">Redirecting to payment…</h2>
        <p className="text-slate-300 mb-4">Hold tight while we create your secure Stripe checkout.</p>
        {Summary}
      </div>
    </div>
  );
}
