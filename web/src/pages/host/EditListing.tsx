// sleepinn/web/src/pages/host/EditListing.tsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSession } from "../../lib/useSession";
import { api } from "../../lib/api";
import PhotoUploader from "../../components/PhotoUploader";

export default function EditListing() {
  const { id: rawId } = useParams();
  const id = rawId && rawId !== "new" && rawId !== "undefined" ? rawId : undefined;
  const isNew = !id;
  const { user, loading } = useSession();
  
  const nav = useNavigate();
  useEffect(() => {
    if (rawId === "undefined") nav("/host/new/edit", { replace: true });
  }, [rawId, nav]);
  
  const [form, setForm] = useState({
    title: "", city: "", pricePerNight: 100, beds: 1, baths: 1, instant: false, description: ""
  });

  useEffect(() => { if (!loading && !user) nav("/login"); }, [loading, user, nav]);

  async function save() {
    if (isNew) {
      const created = await api("/api/host/listings", { method: "POST", body: JSON.stringify(form) });
      nav(`/host/${created.id}/edit`);
    } else {
      await api(`/api/host/listings/${id}`, { method: "PUT", body: JSON.stringify(form) });
      alert("Saved");
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>{isNew ? "New Listing" : "Edit Listing"}</h1>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
        <label>Title <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></label>
        <label>City <input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></label>
        <label>Price/night (RM) <input type="number" value={form.pricePerNight} onChange={e => setForm({ ...form, pricePerNight: Number(e.target.value) })} /></label>
        <label>Beds <input type="number" value={form.beds} onChange={e => setForm({ ...form, beds: Number(e.target.value) })} /></label>
        <label>Baths <input type="number" value={form.baths} onChange={e => setForm({ ...form, baths: Number(e.target.value) })} /></label>
        <label style={{ gridColumn: "1 / -1" }}>
          <input type="checkbox" checked={form.instant} onChange={e => setForm({ ...form, instant: e.target.checked })} /> Instant
        </label>
        <label style={{ gridColumn: "1 / -1" }}>Description
          <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        </label>
      </div>

      {!isNew && (
        <>
          <h3 style={{ marginTop: 16 }}>Photos</h3>
          <PhotoUploader listingId={id!} />
        </>
      )}

      <div style={{ marginTop: 16 }}>
        <button onClick={save}>{isNew ? "Create" : "Save"}</button>
      </div>
    </div>
  );
}
