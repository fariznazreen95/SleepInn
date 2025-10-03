// web/src/pages/host/EditListing.tsx
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useToast } from "../../components/Toast";
import PhotoUploader from "../../components/PhotoUploader";

const ACCENT = "#f0c75e";
const ACCENT_BORDER = "rgba(240,199,94,0.30)";
const PANEL = "rgba(14,32,51,0.78)";
const PANEL2 = "rgba(14,32,51,0.62)";
const BORDER = "rgba(28,59,90,0.60)";
const TEXT = "#e9edf5";
const MUTED = "rgba(233,237,245,0.78)";

type Form = {
  title: string;
  city: string;
  country: string;
  pricePerNight: number | "";
  beds: number | "";
  baths: number | "";
  instant: boolean;
  description: string;
};

export default function EditListing() {
  const { push } = useToast();
  const nav = useNavigate();
  const { id: rawId } = useParams();
  const id = rawId && rawId !== "new" && rawId !== "undefined" ? Number(rawId) : undefined;
  const isNew = !id;

  const [form, setForm] = useState<Form>({
    title: "",
    city: "",
    country: "Malaysia",
    pricePerNight: "",
    beds: "",
    baths: "",
    instant: false,
    description: "",
  });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Load listing (tries /api/host/listings/:id, falls back to list+find)
  useEffect(() => {
    if (!id) return;
    let on = true;
    (async () => {
      setLoading(true);
      try {
        let data: any = null;
        try { data = await api(`/api/host/listings/${id}`); } catch {}
        if (!data || data.error) {
          const all = await api("/api/host/listings");
          data = (Array.isArray(all) ? all : []).find((x: any) => Number(x.id) === id);
        }
        if (on && data) {
          setForm({
            title: data.title ?? "",
            city: data.city ?? "",
            country: data.country ?? "Malaysia",
            pricePerNight: Number(data.price_per_night ?? data.pricePerNight ?? 0) || "",
            beds: Number(data.beds ?? 1) || "",
            baths: Number(data.baths ?? 1) || "",
            instant: Boolean(data.instant),
            description: data.description ?? "",
          });
        }
      } catch {
        push("Failed to load listing");
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => { on = false; };
  }, [id, push]);

  const canSave = useMemo(() => {
    return String(form.title).trim().length >= 3 &&
           String(form.city).trim().length >= 2 &&
           Number(form.pricePerNight) > 0 &&
           Number(form.beds) >= 0 &&
           Number(form.baths) >= 0;
  }, [form]);

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        city: form.city,
        country: form.country || "Malaysia",
        pricePerNight: Number(form.pricePerNight),
        beds: Number(form.beds || 0),
        baths: Number(form.baths || 0),
        instant: Boolean(form.instant),
        description: form.description || "",
      };

      if (isNew) {
        const out = await api("/api/host/listings", { method: "POST", body: JSON.stringify(payload) });
        if (out?.id) { push("Listing created"); nav(`/host/${out.id}/edit`, { replace: true }); return; }
        push(out?.error || "Create failed");
      } else {
        const out = await api(`/api/host/listings/${id}`, { method: "PUT", body: JSON.stringify(payload) });
        if (out?.ok || out?.id || out?.updated) { push("Saved"); return; }
        push(out?.error || "Save failed");
      }
    } catch (e: any) {
      push(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (!id) return;
    setPublishing(true);
    try {
      const out = await api(`/api/host/listings/${id}/publish`, { method: "POST" });
      if (out?.ok) push("Listing published");
      else push(out?.error || "Publish failed");
    } catch (e: any) {
      push(e?.message || "Publish failed");
    } finally {
      setPublishing(false);
    }
  }

  if (loading) {
    return (
      <div className="el wrap">
        <Header id={id} isNew={isNew} />
        <div className="grid2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="panel skeleton">
              <div className="skeleton line w160" />
              <div className="skeleton line w100 h24" />
              <div className="skeleton line w100 h24" />
              <div className="skeleton line w100 h24" />
            </div>
          ))}
        </div>
        <Style />
      </div>
    );
  }

  return (
    <div className="el wrap">
      <Header id={id} isNew={isNew} />

      {/* Step hint */}
      <div className="steps muted">
        <span className="dot done" /> Basics
        <span className="chev">›</span>
        <span className={`dot ${canSave ? "done" : ""}`} /> Details & Pricing
        {!isNew && (<><span className="chev">›</span><span className="dot" /> Photos</>)}
      </div>

      <div className="grid2">
        {/* Basics */}
        <Card title="Basics">
          <Row label="Title"><input className="inp" value={form.title} onChange={e => set("title", e.target.value)} /></Row>
          <Row label="City"><input className="inp" value={form.city} onChange={e => set("city", e.target.value)} /></Row>
          <Row label="Country"><input className="inp" value={form.country} onChange={e => set("country", e.target.value)} /></Row>
          <Row label="Description"><textarea rows={6} className="inp" value={form.description} onChange={e => set("description", e.target.value)} /></Row>
        </Card>

        {/* Details & Pricing */}
        <Card title="Details & Pricing">
          <Row label="Price per night (RM)">
            <input type="number" min={0} className="inp"
              value={form.pricePerNight}
              onChange={e => set("pricePerNight", (e.target.value === "" ? "" : Number(e.target.value)) as any)} />
          </Row>
          <div className="cols">
            <Row label="Beds"><input type="number" min={0} className="inp" value={form.beds} onChange={e => set("beds", (e.target.value === "" ? "" : Number(e.target.value)) as any)} /></Row>
            <Row label="Baths"><input type="number" min={0} className="inp" value={form.baths} onChange={e => set("baths", (e.target.value === "" ? "" : Number(e.target.value)) as any)} /></Row>
          </div>
          <Row label="Instant book">
            <label className="switch">
              <input type="checkbox" checked={form.instant} onChange={(e) => set("instant", e.target.checked)} />
              <span className="track"><span className="knob" /></span>
              <span className="slabel muted">Enable instant booking</span>
            </label>
          </Row>
        </Card>
      </div>

      {/* Photos — beautified */}
      {!isNew && (
        <div className="photos">
          <Card title="Photos">
            <div className="phototop">
              <div>
                <div className="muted">Listing photos</div>
                <div className="tiny muted">PNG/JPG up to ~10MB each. First photo becomes the cover.</div>
              </div>
              <div className="muted tiny hide-sm">Tip: drag & drop images into the frame</div>
            </div>

            <div className="dropwrap">
              <div className="dropbg" />
              {/* Your existing uploader (logic unchanged) */}
              <PhotoUploader listingId={String(id)} />
            </div>

            <ul className="phototips muted">
              <li>Landscape 3:2 or 4:3 looks best across devices.</li>
              <li>Use bright, clutter-free shots; include a hero exterior.</li>
              <li>Reorder to change cover after upload.</li>
            </ul>
          </Card>
        </div>
      )}

      {/* Sticky save dock */}
      <div className="savedock panel">
        <div className="muted sd-left">{isNew ? "New listing" : `Editing #${id}`}</div>
        <div className="sd-actions">
          <Link to="/host/listings" className="btn ghost">Back to listings</Link>
          {!isNew && <button onClick={publish} disabled={publishing} className="btn panelbtn">{publishing ? "Publishing…" : "Publish"}</button>}
          <button onClick={save} disabled={!canSave || saving} className="btn primary">{saving ? "Saving…" : isNew ? "Create" : "Save"}</button>
        </div>
      </div>

      <Style />
    </div>
  );
}

/* ---------- pieces ---------- */

function Header({ id, isNew }: { id?: number; isNew: boolean }) {
  return (
    <div className="toprow panel">
      <div>
        <div className="eyebrow">{isNew ? "Create" : "Edit"}</div>
        <h2 className="h-title">{isNew ? "New Listing" : `Listing #${id}`}</h2>
      </div>
      <div className="cta">
        <Link to="/host/listings" className="btn ghost">Manage listings</Link>
        {!isNew && <Link to={`/listing/${id}`} className="btn panelbtn">Preview</Link>}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel card">
      <div className="cardhead"><div className="cardtitle">{title}</div></div>
      <div className="cardbody">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="row">
      <div className="lbl">{label}</div>
      {children}
    </label>
  );
}

/* ---------- styles ---------- */

function Style() {
  return (
    <style>{`
      .wrap { max-width: 1152px; margin: 0 auto; color: ${TEXT}; }

      .panel { background:${PANEL}; border:1px solid ${BORDER}; border-radius:16px; }
      .panel:hover { border-color:${ACCENT_BORDER}; }

      .toprow { padding:14px 16px; display:flex; align-items:flex-end; justify-content:space-between; gap:12px; }
      .eyebrow { color:${MUTED}; font-size:12px; text-transform:uppercase; letter-spacing:.12em; }
      .h-title { font-size:28px; font-weight:800; letter-spacing:.2px; margin-top:2px; }
      .cta { display:flex; gap:8px; }

      .btn {
        display:inline-flex; align-items:center; justify-content:center;
        padding:10px 12px; border-radius:12px; border:1px solid ${BORDER};
        color:${TEXT}; text-decoration:none; transition: background .18s ease, color .18s ease, border-color .18s ease;
      }
      .btn.primary { background:${ACCENT}; color:#0b1220; border-color:${ACCENT_BORDER}; }
      .btn.primary:hover { filter:brightness(.98); }
      .btn.panelbtn { background:${PANEL2}; }
      .btn.ghost:hover { background: rgba(240,199,94,.12); border-color:${ACCENT_BORDER}; color:${ACCENT}; }

      .steps { display:flex; align-items:center; gap:10px; margin:12px 2px; font-size:13px; }
      .dot { width:8px; height:8px; border-radius:999px; display:inline-block; background:${PANEL2}; border:1px solid ${BORDER}; }
      .dot.done { background:${ACCENT}; border-color:${ACCENT_BORDER}; }
      .chev { opacity:.5; }

      .grid2 { display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
      @media (max-width: 860px) { .grid2 { grid-template-columns: 1fr; } }

      .cardhead { padding:12px 12px 0; }
      .cardtitle { font-weight:700; }
      .cardbody { padding:12px; display:grid; gap:10px; }

      .row .lbl { margin-bottom:6px; color:${MUTED}; font-size:13px; }
      .cols { display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
      @media (max-width: 540px) { .cols { grid-template-columns: 1fr; } }

      .inp {
        width:100%; border-radius:12px; padding:10px 12px; color:${TEXT};
        background: rgba(10,20,32,.62); border:1px solid ${BORDER};
        transition: border-color .18s ease, box-shadow .18s ease;
      }
      .inp:focus { outline:none; border-color:${ACCENT_BORDER}; box-shadow:0 0 0 3px rgba(240,199,94,.16); }

      /* switch */
      .switch { display:inline-flex; align-items:center; gap:10px; cursor:pointer; }
      .switch input { position:absolute; opacity:0; pointer-events:none; }
      .track { position:relative; width:44px; height:26px; background:${PANEL2}; border:1px solid ${BORDER}; border-radius:999px; transition:all .18s ease; }
      .knob { position:absolute; top:2px; left:2px; width:20px; height:20px; border-radius:999px; background:${TEXT}; transition: transform .18s ease; }
      .switch input:checked + .track { background:${ACCENT}; border-color:${ACCENT_BORDER}; }
      .switch input:checked + .track .knob { transform: translateX(18px); }
      .slabel { font-size:14px; }

      /* photos */
      .photos { margin-top:12px; }
      .phototop { display:flex; align-items:flex-end; justify-content:space-between; gap:12px; padding:0 4px 4px; }
      .tiny { font-size:12px; }
      .hide-sm { display:block; } @media (max-width:640px){ .hide-sm{ display:none; } }

      .dropwrap {
        position: relative;
        border: 1.5px dashed ${BORDER};
        border-radius: 14px;
        padding: 14px;
        min-height: 220px;
        background: linear-gradient(180deg, rgba(10,20,32,.46), rgba(10,20,32,.26));
        overflow: hidden;
        transition: border-color .18s ease, box-shadow .18s ease, background .18s ease;
      }
      .dropwrap:hover { border-color:${ACCENT_BORDER}; box-shadow: 0 8px 24px rgba(0,0,0,.22); background: linear-gradient(180deg, rgba(10,20,32,.54), rgba(10,20,32,.34)); }
      .dropbg {
        pointer-events:none; position:absolute; inset:0;
        background: radial-gradient(600px 120px at 30% 0%, rgba(240,199,94,.10), transparent 70%);
        opacity:.7;
      }
      /* Make default controls inside uploader feel native to SleepInn */
      .dropwrap button,
      .dropwrap .btn {
        background:${ACCENT}; color:#0b1220; border:1px solid ${ACCENT_BORDER};
        border-radius:10px; padding:8px 12px; font-weight:600; transition: filter .18s ease, transform .06s ease;
      }
      .dropwrap button:hover,
      .dropwrap .btn:hover { filter:brightness(.98); }
      .dropwrap button:active,
      .dropwrap .btn:active { transform: translateY(1px); }

      .dropwrap input[type="file"] {
        appearance: none; background:${PANEL2}; border:1px solid ${BORDER};
        border-radius:10px; padding:8px; color:${TEXT};
      }

      .phototips { display:flex; flex-wrap:wrap; gap:14px; padding:8px 4px 0; font-size:12px; }
      .phototips li { list-style: none; position: relative; padding-left:14px; }
      .phototips li::before { content:"•"; position:absolute; left:2px; color:${ACCENT}; }

      /* sticky save dock */
      .savedock {
        position: sticky; bottom: 12px; margin-top: 14px; padding:10px 12px;
        display:flex; align-items:center; justify-content:space-between; gap:10px;
        background:${PANEL}; border:1px solid ${BORDER}; border-radius:14px;
        box-shadow: 0 10px 24px rgba(0,0,0,.28);
      }
      .sd-left { font-size:13px; }
      .sd-actions { display:flex; gap:8px; }

      /* skeletons */
      .skeleton { position:relative; overflow:hidden; padding:12px; }
      .skeleton::after { content:""; position:absolute; inset:0; background:linear-gradient(90deg, transparent, rgba(255,255,255,.06), transparent); animation:shimmer 1.2s infinite; }
      .skeleton.line { height:14px; border-radius:8px; background:rgba(148,163,184,.10); margin-top:8px; }
      .skeleton.h24 { height:24px; }
      .skeleton.w100{width:100px;} .skeleton.w160{width:160px;}
      @keyframes shimmer { 0%{ transform: translateX(-100%);} 100%{ transform: translateX(100%);} }
    `}</style>
  );
}
