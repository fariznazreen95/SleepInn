import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { api } from "../../lib/api"; // ✅ fixed relative path

type State =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "conflict"; message: string }
  | { kind: "error"; message: string };

export default function Checkout() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [state, setState] = useState<State>({ kind: "idle" });

  const input = useMemo(() => {
    const listingId = Number(params.get("listingId"));
    const start = params.get("start") || "";
    theEnd: {
    }
    const end = params.get("end") || "";
    const guests = Number(params.get("guests") || "1");
    return { listingId, start, end, guests };
  }, [params]);

  useEffect(() => {
    let on = true;
    async function run() {
      try {
        setState({ kind: "working" });
        // 1) create booking
        const b = await api("/api/bookings", {
          method: "POST",
          body: JSON.stringify({
            listingId: input.listingId,
            start: input.start,
            end: input.end,
            guests: input.guests,
          }),
        });

        // 2) stripe checkout (dev returns a success url)
        const s = await api(`/api/stripe/checkout/${b.id}`, { method: "POST" });
        if (!on) return;
        window.location.assign(s.url || `/success?booking=${b.id}`);
      } catch (e: any) {
        const msg = String(e?.message || "Something went wrong");
        if (!on) return;
        if (/Dates are no longer available/i.test(msg)) {
          setState({ kind: "conflict", message: msg });
        } else {
          setState({ kind: "error", message: msg });
        }
      }
    }

    if (!input.listingId || !input.start || !input.end) {
      setState({ kind: "error", message: "Missing or invalid checkout parameters." });
      return;
    }
    run();
    return () => { on = false; };
  }, [input]);

  if (state.kind === "conflict") {
    const backToListing = `/listings/${input.listingId}?start=${encodeURIComponent(
      input.start
    )}&end=${encodeURIComponent(input.end)}&guests=${input.guests}`;
    return (
      <div style={{ padding: 24 }}>
        <h2 style={{ marginBottom: 8 }}>Those dates just got snapped 😬</h2>
        <p style={{ marginBottom: 16 }}>{state.message}</p>
        <p>
          <Link to={backToListing}>Go back to the listing</Link> to pick new dates,
          or <Link to="/">search again</Link>.
        </p>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div style={{ padding: 24 }}>
        <h2 style={{ marginBottom: 8 }}>Checkout failed</h2>
        <p style={{ marginBottom: 16 }}>{state.message}</p>
        <p><Link to="/">Return home</Link></p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <p>Redirecting to payment…</p>
    </div>
  );
}
