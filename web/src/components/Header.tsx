import { NavLink, Link, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "../lib/useSession";
import { logout as apiLogout } from "../lib/api";

/* ---------------------------------------------------------
   Theme presets (swap ACTIVE_THEME to taste)
   - midnightGold: your current SleepInn vibe
   - charcoalCopper: darker base + warm copper accent
   - slateAqua: slightly cooler with aqua accent
--------------------------------------------------------- */
const THEMES = {
  midnightGold: {
    bgStart: "#0b1220",
    bgEnd: "rgba(11,18,32,0.60)",
    panel: "rgba(14,32,51,0.78)",
    border: "rgba(91,123,161,0.28)",
    text: "#e9edf5",
    muted: "rgba(233,237,245,0.78)",
    accent: "#f0c75e",
    accentSoft: "rgba(240,199,94,0.10)",
    accentBorder: "rgba(240,199,94,0.28)"
  },
  charcoalCopper: {
    bgStart: "#0e0f12",
    bgEnd: "rgba(14,15,18,0.66)",
    panel: "rgba(28,28,32,0.78)",
    border: "rgba(255,135,60,0.22)",
    text: "#eef0f4",
    muted: "rgba(238,240,244,0.78)",
    accent: "#ff873c",
    accentSoft: "rgba(255,135,60,0.10)",
    accentBorder: "rgba(255,135,60,0.28)"
  },
  slateAqua: {
    bgStart: "#0a1420",
    bgEnd: "rgba(10,20,32,0.62)",
    panel: "rgba(20,35,54,0.78)",
    border: "rgba(98,195,210,0.28)",
    text: "#eaf7ff",
    muted: "rgba(234,247,255,0.78)",
    accent: "#62c3d2",
    accentSoft: "rgba(98,195,210,0.10)",
    accentBorder: "rgba(98,195,210,0.28)"
  }
};

// ⬇️ switch palette here
const ACTIVE_THEME = THEMES.midnightGold;

/* ---------------------------------------------------------
   Utils
--------------------------------------------------------- */
function hexToRgb(hex: string): [number, number, number] {
  const x = hex.replace("#", "");
  const n = parseInt(x.length === 3 ? x.split("").map(c => c + c).join("") : x, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export default function Header() {
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const [elev, setElev] = useState(false);
  const navigate = useNavigate();

  async function onLogout() {
    try {
      await apiLogout(); // POST /api/auth/logout (with credentials)
      navigate("/", { replace: true });
      // hard refresh to be 100% sure header picks anon state in all tabs
      window.setTimeout(() => window.location.reload(), 0);
    } catch {
      // optional: toast here if you have one in header
      // toast({ title: "Logout failed", variant: "destructive" });
    }
  }

  useEffect(() => {
    const onScroll = () => setElev(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = [
    { to: "/", label: "Home" },
    { to: "/trips", label: "My Trips" },
    { to: "/host", label: "Host" },
    { to: "/host/bookings", label: "Host Bookings" },
    { to: "/host/listings", label: "Host Listings" }
  ];

  // build CSS with theme tokens
  const css = useMemo(() => {
    const t = ACTIVE_THEME;
    const [ar, ag, ab] = hexToRgb(t.accent);

    return `
      .hdr {
        position: sticky;
        top: 0;
        z-index: 50;
        backdrop-filter: blur(6px);
        background: linear-gradient(180deg, ${t.bgStart}, ${t.bgEnd});
        border-bottom: 1px solid ${t.border};
        transition: box-shadow .18s ease, border-color .18s ease;
      }
      .hdr.elev {
        box-shadow: 0 8px 24px rgba(0,0,0,0.25);
        border-bottom-color: ${t.accentBorder};
      }
      .hdr .inner {
        max-width: 1152px;
        margin: 0 auto;
        padding: 10px 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        color: ${t.text};
      }
      .brand {
        font-weight: 700;
        letter-spacing: .5px;
        text-decoration: none;
        color: ${t.text};
        padding: 6px 8px;
        border-radius: 10px;
        border: 1px solid transparent;
      }
      .right, .nav {
        display: flex; align-items: center; gap: 8px;
      }
      a.navlink {
        padding: 8px 10px;
        border-radius: 10px;
        text-decoration: none;
        color: ${t.text};
        border: 1px solid transparent;
        transition: background .18s ease, color .18s ease, border-color .18s ease;
      }
      a.navlink:hover {
        background: ${t.accentSoft};
        border-color: ${t.accentBorder};
        color: ${t.accent};
      }
      a.navlink.active {
        background: ${t.accentSoft};
        border-color: ${t.accentBorder};
        color: ${t.accent};
      }
      button.navlink {
        padding: 8px 10px;
        border-radius: 10px;
        border: 1px solid transparent;
        background: transparent;
        color: inherit;
        cursor: pointer;
        transition: background .18s ease, color .18s ease, border-color .18s ease;
      }
      button.navlink:hover {
        background: ${ACTIVE_THEME.accentSoft};
        border-color: ${ACTIVE_THEME.accentBorder};
        color: ${ACTIVE_THEME.accent};
      }
      .muted { color: ${t.muted}; }
      .panel {
        background: ${t.panel};
        border: 1px solid ${t.border};
      }
      .menuBtn {
        width: 38px; height: 38px;
        border-radius: 10px;
        display: inline-flex; align-items: center; justify-content: center;
      }

      /* responsiveness */
      @media (min-width: 900px) {
        .__desktop { display: flex !important; }
        .__mobile { display: none !important; }
      }
      @media (max-width: 899px) {
        .__desktop { display: none !important; }
        .__mobile { display: inline-flex !important; }
      }

      /* focus ring for a11y */
      a.navlink:focus-visible, .menuBtn:focus-visible, .brand:focus-visible {
        outline: 2px solid rgba(${ar},${ag},${ab},0.6);
        outline-offset: 2px;
      }
    `;
  }, []);

  return (
    <header className={`hdr ${elev ? "elev" : ""}`}>
      <div className="inner">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link to="/" className="brand" aria-label="SleepInn home">SleepInn</Link>

          {/* Desktop nav */}
          <nav className="nav __desktop">
            {links.map(l => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) => `navlink ${isActive ? "active" : ""}`}
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Right side */}
        <div className="right">
          {user ? (
            <>
              <NavLink
                to="/change-password"
                className={({ isActive }) => `navlink __desktop ${isActive ? "active" : ""}`}
              >
                Account
              </NavLink>
              <button onClick={onLogout} className="navlink __desktop">
                Logout
              </button>
            </>
          ) : (
            <NavLink
              to="/login"
              className={({ isActive }) => `navlink __desktop ${isActive ? "active" : ""}`}
            >
              Log in
            </NavLink>
          )}

          {/* Mobile toggle */}
          <button
            aria-label="Menu"
            onClick={() => setOpen(v => !v)}
            className="menuBtn panel __mobile"
            style={{ color: ACTIVE_THEME.text }}
          >
            ☰
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div
          style={{ borderTop: `1px solid ${ACTIVE_THEME.border}`, background: ACTIVE_THEME.bgStart }}
          className="__mobile"
        >
          <div style={{ maxWidth: 1152, margin: "0 auto", padding: "8px 16px" }}>
            <nav style={{ display: "grid", gap: 6 }}>
              {links.map(l => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) => `navlink ${isActive ? "active" : ""}`}
                  style={{ display: "block" }}
                >
                  {l.label}
                </NavLink>
              ))}
              {user ? (
                <>
                  <NavLink
                    to="/change-password"
                    onClick={() => setOpen(false)}
                    className="navlink"
                    style={{ display: "block" }}
                  >
                    Account
                  </NavLink>
                  <button
                    onClick={() => { setOpen(false); onLogout(); }}
                    className="navlink"
                    style={{ display: "block", textAlign: "left" }}
                  >
                    Logout
                  </button>
                </>
              ) : (
                <NavLink
                  to="/login"
                  onClick={() => setOpen(false)}
                  className="navlink"
                  style={{ display: "block" }}
                >
                  Log in
                </NavLink>
              )}
            </nav>
          </div>
        </div>
      )}

      {/* inject dynamic CSS */}
      <style>{css}</style>
    </header>
  );
}
