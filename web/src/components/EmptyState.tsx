// web/src/components/EmptyState.tsx
import { Link } from "react-router-dom";

type Props = {
  title: string;
  body?: string;
  actionHref?: string;
  actionText?: string;
};

export default function EmptyState({ title, body, actionHref, actionText }: Props) {
  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-900/40 p-8 text-center">
      <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-slate-800/80 ring-1 ring-slate-700/50 flex items-center justify-center">
        <span className="text-slate-300">☕</span>
      </div>
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      {body && <p className="mt-1 text-sm text-slate-400">{body}</p>}
      {actionHref && actionText && (
        <div className="mt-4">
          <Link
            to={actionHref}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm hover:bg-indigo-500"
          >
            {actionText} →
          </Link>
        </div>
      )}
    </div>
  );
}
