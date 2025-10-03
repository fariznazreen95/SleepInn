import { useSearchParams, Link } from "react-router-dom";

export default function Success() {
  const [q] = useSearchParams();
  const id = q.get("booking");

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: 32, textAlign: "center" }}>
      <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>Payment Successful</h2>
      <p style={{ opacity: 0.85, marginBottom: 16 }}>
        {id ? <>Your booking <b>#{id}</b> is confirmed.</> : "Your payment completed."}
      </p>
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <Link to="/trips" style={{ padding: "10px 12px", borderRadius: 10, background: "#1f3a5a", border: "1px solid rgba(28,59,90,0.6)" }}>
          Go to My Trips →
        </Link>
        <Link to="/" style={{ padding: "10px 12px", borderRadius: 10, background: "#2b4d77", border: "1px solid rgba(28,59,90,0.6)" }}>
          Explore more stays
        </Link>
      </div>
    </div>
  );
}
