import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API } from "../../lib/config";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw new Error(await res.text());
      nav("/host", { replace: true });
    } catch (e:any) { setErr(e.message || "Login failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="container" style={{ maxWidth: 420, padding: 24 }}>
      <h1>Login</h1>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <label>Email <input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
        <label>Password <input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
        {err && <div style={{ color: "crimson" }}>{err}</div>}
        <button disabled={busy} type="submit">{busy ? "Logging in…" : "Login"}</button>
      </form>
    </div>
  );
}
