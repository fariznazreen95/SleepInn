import { useState } from "react";
import { API } from "../../lib/config";
import { useToast } from "../../components/Toast";

export default function ChangePassword() {
  const [oldPassword, setOld] = useState("");
  const [newPassword, setNew] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`${API}/api/change-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.push("✅ Password changed successfully.");
      setOld(""); setNew("");
    } catch (e: any) {
      toast.push(e?.message || "Failed to change password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ maxWidth: 480, margin: "0 auto" }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>Account · Change Password</h2>
      <div style={{ display: "grid", gap: 10 }}>
        <input placeholder="Current password" type="password" value={oldPassword} onChange={e => setOld(e.target.value)} required/>
        <input placeholder="New password" type="password" value={newPassword} onChange={e => setNew(e.target.value)} required/>
        <button disabled={busy} style={{ padding: "10px 12px", borderRadius: 10, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
