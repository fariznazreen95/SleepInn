import { useState } from "react";
import { API } from "../../lib/config";

export default function ChangePassword() {
  const [oldPassword, setOld] = useState("");
  const [newPassword, setNew] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`${API}/api/change-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMsg("✅ Password changed successfully.");
      setOld(""); setNew("");
    } catch (err: any) {
      setMsg("❌ " + (err.message || "Failed to change password"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "24px auto" }}>
      <h1>Change Password</h1>
      <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
        <label>Old password
          <input type="password" value={oldPassword} onChange={e => setOld(e.target.value)} required />
        </label>
        <label>New password
          <input type="password" value={newPassword} onChange={e => setNew(e.target.value)} required />
        </label>
        <button disabled={busy} type="submit">{busy ? "Saving…" : "Save"}</button>
      </form>
      {msg && <div style={{ marginTop: 12 }}>{msg}</div>}
    </div>
  );
}
