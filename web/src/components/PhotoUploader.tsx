import { useRef, useState } from "react";
import { api } from "../lib/api";

type Photo = { url: string };

export default function PhotoUploader({ listingId }: { listingId: string }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  function clickPicker() {
    inputRef.current?.click();
  }

  async function onChoose(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget; // capture before awaits (React pools events)
    const file = input.files?.[0];
    if (!file) return;

    setNote("");
    setBusy(true);
    try {
      // --- Path A: presign + upload + confirm --------------------------------
      // POST /api/photos/presign { listingId:number, contentType:string }
      // Response shapes we support:
      //  A) { uploadUrl, publicUrl, key, method?: "PUT" }      // PUT
      //  B) { url, fields, publicUrl, key, method?: "POST" }   // S3 POST
      //  C) { mode: "dev", uploadUrl: null, publicUrl, key }   // dev shortcut
      let presign: any = null;
      try {
        presign = await api("/api/photos/presign", {
          method: "POST",
          body: JSON.stringify({
            listingId: Number(listingId),
            contentType: file.type || "image/jpeg",
          }),
        });

        // DEV shortcut: no actual upload; just confirm + preview
        if (presign?.mode === "dev") {
          const publicUrl = presign.publicUrl || presign.public_url;
          const key = presign.key || "dev";
          await api(`/api/host/listings/${listingId}/photos/confirm`, {
            method: "POST",
            body: JSON.stringify({
              listingId: Number(listingId),
              url: publicUrl,
              key,
              order: photos.length,
            }),
          }).catch(() => {});
          setPhotos((prev) => [...prev, { url: publicUrl }]);
          setNote("Uploaded ✔ (dev)");
          input.value = "";
          setBusy(false);
          return;
        }
      } catch {
        presign = null;
      }

      if (presign && (presign.uploadUrl || presign.url)) {
        const uploadUrl = presign.uploadUrl || presign.url;
        const publicUrl = presign.publicUrl || presign.public_url || presign.url;
        const key = presign.key || presign.objectKey || presign.object_key || null;

        // Do the actual upload to the presigned target
        if (presign.fields) {
          // S3 POST form-style
          const fd = new FormData();
          for (const [k, v] of Object.entries(presign.fields)) fd.append(k, String(v));
          fd.append("file", file);
          const up = await fetch(uploadUrl, { method: "POST", body: fd }); // no credentials
          if (!up.ok) {
            const txt = await up.text().catch(() => "");
            throw new Error(`Upload failed (${up.status}). ${txt}`);
          }
        } else {
          // PUT upload
          const up = await fetch(uploadUrl, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": file.type || "application/octet-stream" },
          });
          if (!up.ok) {
            const txt = await up.text().catch(() => "");
            throw new Error(`Upload failed (${up.status}). ${txt}`);
          }
        }

        // Confirm so the backend attaches it to the listing/photos table
        try {
          await api(`/api/host/listings/${listingId}/photos/confirm`, {
            method: "POST",
            body: JSON.stringify({
              listingId: Number(listingId),
              url: publicUrl,
              key,
              order: photos.length, // maintain simple append ordering
            }),
          });
        } catch {
          // even if confirm fails, still show uploaded preview
        }

        setPhotos((prev) => [...prev, { url: publicUrl }]);
        setNote("Uploaded ✔");
        input.value = ""; // reset
        setBusy(false);
        return;
      }

      // --- Path B: legacy multipart (best-effort) -----------------------------
      // Older branch: /api/photos/upload (multipart) → { url }
      try {
        const fd = new FormData();
        fd.append("listingId", listingId);
        fd.append("file", file);
        const res = await fetch(`/api/photos/upload`, {
          method: "POST",
          body: fd,
          credentials: "include",
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j?.url) {
          throw new Error(j?.error || "Upload failed");
        }
        // Confirm (use correct endpoint)
        try {
          await api(`/api/host/listings/${listingId}/photos/confirm`, {
            method: "POST",
            body: JSON.stringify({
              listingId: Number(listingId),
              url: j.url,
              key: j.key ?? null,
              order: photos.length,
            }),
          });
        } catch {}
        setPhotos((prev) => [...prev, { url: j.url }]);
        setNote("Uploaded ✔");
        input.value = "";
        setBusy(false);
        return;
      } catch (err) {
        throw err;
      }
    } catch (e: any) {
      setNote(e?.message || "Upload failed");
      setBusy(false);
    }
  }

  return (
    <div>
      <div
        className={`rounded-2xl border border-slate-700/50 bg-slate-900/30 p-4 ${
          busy ? "opacity-75 pointer-events-none" : ""
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Listing photos</div>
            <div className="text-sm text-slate-400">
              PNG/JPG up to ~10MB. First photo becomes the cover.
            </div>
          </div>
          <button
            type="button"
            onClick={clickPicker}
            disabled={busy}
            className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm disabled:opacity-50"
          >
            {busy ? "Uploading…" : "Add photo"}
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onChoose}
          disabled={busy}
        />

        {note && <div className="mt-3 text-sm text-slate-300">{note}</div>}

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {photos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700/60 bg-slate-900/40 p-6 text-center text-slate-400">
              No photos yet. Click <b className="text-slate-200">Add photo</b> to upload.
            </div>
          ) : (
            photos.map((p, i) => (
              <div key={i} className="overflow-hidden rounded-xl border border-slate-700/50 bg-slate-900/40">
                <img src={p.url} alt={`Photo ${i + 1}`} className="h-40 w-full object-cover" loading="lazy" />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
