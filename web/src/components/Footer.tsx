import { Link } from "react-router-dom";

const COLORS = {
  border: "rgba(28,59,90,0.6)",
  sub: "rgba(233,237,245,0.75)"
};

export default function Footer() {
  return (
    <footer style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 24 }}>
      <div
        style={{
          maxWidth: 1152,
          margin: "0 auto",
          padding: "16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: COLORS.sub,
          fontSize: 14
        }}
      >
        <span>© {new Date().getFullYear()} SleepInn</span>
        <nav style={{ display: "flex", gap: 12 }}>
          <Link to="/">Home</Link>
          <Link to="/trips">My Trips</Link>
          <Link to="/host">Host</Link>
        </nav>
      </div>
    </footer>
  );
}
