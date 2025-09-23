import { useState } from "react";
import { api } from "../lib/api";

export default function PhotoUploader({ listingId }: { listingId: string }) {
  const [photos, setPhotos] = useState<{ url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function onChoose(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return alert("Choose an image");

    setBusy(true);
    try {
      const presign = await api("/api/photos/presign", {
        method: "POST",
        body: JSON.stringify({ listingId: Number(listingId), contentType: file.type })
      });

      const fd = new FormData();
      Object.entries(presign.fields).forEach(([k, v]: any) => fd.append(k, String(v)));
      fd.append("Content-Type", file.type);
      fd.append("file", file);

      const resp = await fetch(presign.url, { method: "POST", body: fd });
      if (!resp.ok) throw new Error("Upload failed (storage env not set?)");

      await api(`/api/host/listings/${listingId}/photos/confirm`, {
        method: "POST",
        body: JSON.stringify({ url: presign.publicUrl, key: presign.key, order: photos.length })
      });

      setPhotos([...photos, { url: presign.publicUrl }]);
      setNote("");
    } catch (e:any) {
      setNote(e.message || "Upload error — storage not configured yet?");
    } finally { setBusy(false); }
  }

  return (
    <div>
      <input type="file" accept="image/*" onChange={onChoose} disabled={busy} />
      {note && <div style={{ color: "orange", marginTop: 8 }}>{note}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        {photos.map((p, i) => <img key={i} src={p.url} style={{ width: 160, height: 120, objectFit: "cover", borderRadius: 8 }} />)}
      </div>
    </div>
  );
}
