import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API } from "../../lib/config";
import { useToast } from "../../components/Toast";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "Login failed");
      }
      nav("/");
    } catch (e: any) {
      toast.push(e?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ maxWidth: 420, margin: "0 auto" }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>Log in</h2>
      <div style={{ display: "grid", gap: 10 }}>
        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required/>
        <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required/>
        <button disabled={busy} style={{ padding: "10px 12px", borderRadius: 10, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Signing in…" : "Log in"}
        </button>
      </div>
    </form>
  );
}
