// web/src/components/PhotoUploader.tsx
import { useRef, useState } from "react";
import { api } from "../lib/api";

export default function PhotoUploader({ listingId }: { listingId: string }) {
  const [photos, setPhotos] = useState<{ url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function onChoose(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget; // capture before awaits (React pools events)
    inputRef.current = input;

    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Choose an image");
      input.value = "";
      return;
    }

    setBusy(true);
    try {
      // Ask server for presign (or dev-fallback)
      const presign = await api("/api/photos/presign", {
        method: "POST",
        body: JSON.stringify({ listingId, contentType: file.type }),
      });

      // DEV path: skip actual upload, confirm immediately
      if (presign.mode === "dev" || presign.url === "about:blank") {
        await api(`/api/host/listings/${listingId}/photos/confirm`, {
          method: "POST",
          body: JSON.stringify({
            url: presign.publicUrl,
            key: presign.key,
            order: photos.length,
          }),
        });
        setPhotos((p) => [...p, { url: presign.publicUrl }]);
        setNote("Dev image attached (no real upload). Configure S3 envs for real uploads.");
        return;
      }

      // REAL upload (presigned POST to S3)
      const fd = new FormData();
      Object.entries(presign.fields).forEach(([k, v]: any) => fd.append(k, String(v)));
      fd.append("Content-Type", file.type);
      fd.append("file", file);

      const resp = await fetch(presign.url, { method: "POST", body: fd });
      if (!resp.ok) throw new Error("Upload failed (storage not configured?)");

      // Confirm and persist photo row
      await api(`/api/host/listings/${listingId}/photos/confirm`, {
        method: "POST",
        body: JSON.stringify({
          url: presign.publicUrl,
          key: presign.key,
          order: photos.length,
        }),
      });

      setPhotos((p) => [...p, { url: presign.publicUrl }]);
      setNote("");
    } catch (e: any) {
      setNote(e?.message || "Upload error — check storage config.");
    } finally {
      setBusy(false);
      // Safely reset input even after awaits
      try {
        inputRef.current && (inputRef.current.value = "");
      } catch {}
    }
  }

  return (
    <div>
      <input type="file" accept="image/*" onChange={onChoose} disabled={busy} ref={inputRef} />
      {note && <div style={{ color: "orange", marginTop: 8 }}>{note}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        {photos.map((p, i) => (
          <img
            key={i}
            src={p.url}
            style={{ width: 160, height: 120, objectFit: "cover", borderRadius: 8 }}
          />
        ))}
      </div>
    </div>
  );
}
