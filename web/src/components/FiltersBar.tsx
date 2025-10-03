import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

type Props = { count?: number };

export default function FiltersBar({ count }: Props) {
  const [params, setParams] = useSearchParams();

  const chips = useMemo(() => {
    const items: { key: string; label: string; value: string }[] = [];
    const push = (key: string, label: string, value?: string | null) => {
      if (!value) return;
      const v = String(value).trim();
      if (!v) return;
      items.push({ key, label, value: v });
    };

    push("q", "Keyword", params.get("q"));
    push("city", "City", params.get("city"));
    push("start", "Start", params.get("start"));
    push("end", "End", params.get("end"));
    push("guests", "Guests", params.get("guests"));

    return items;
  }, [params]);

  if (chips.length === 0 && typeof count !== "number") return null;

  function remove(key: string) {
    const next = new URLSearchParams(params);
    next.delete(key);
    setParams(next, { replace: true });
  }

  function clearAll() {
    const next = new URLSearchParams(params);
    ["q", "city", "start", "end", "guests"].forEach(k => next.delete(k));
    setParams(next, { replace: true });
  }

  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-900/40 px-3 py-2 flex items-center flex-wrap gap-2">
      {typeof count === "number" && (
        <span className="text-sm text-slate-300 mr-1">{count} result{count === 1 ? "" : "s"}</span>
      )}

      {chips.map((c) => (
        <button
          key={c.key}
          onClick={() => remove(c.key)}
          className="group inline-flex items-center gap-1 rounded-full border border-slate-700/50 bg-slate-800/60 px-2 py-0.5 text-xs text-slate-200 hover:bg-slate-700"
          title={`Remove ${c.label.toLowerCase()}`}
        >
          <span className="opacity-80">{c.label}:</span>
          <span className="font-medium">{c.value}</span>
          <span className="ml-0.5 opacity-70 group-hover:opacity-100">×</span>
        </button>
      ))}

      {chips.length > 0 && (
        <button
          onClick={clearAll}
          className="ml-auto text-xs px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700/50"
          title="Clear all filters"
        >
          Clear
        </button>
      )}
    </div>
  );
}
