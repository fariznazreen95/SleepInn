import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="max-w-lg mx-auto">
      <div className="rounded-2xl border border-slate-700/50 bg-slate-900/40 p-8 text-center">
        <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-slate-800/60 ring-1 ring-slate-700/50 grid place-items-center">
          <span className="text-2xl">🧭</span>
        </div>
        <h2 className="text-xl font-semibold text-white">Page not found</h2>
        <p className="mt-1 text-slate-300">
          The page you’re looking for doesn’t exist.
        </p>

        <div className="mt-6 flex items-center justify-center gap-2">
          <Link
            to="/"
            className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm"
          >
            Go home
          </Link>
          <Link
            to="/trips"
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm"
          >
            My trips
          </Link>
        </div>
      </div>
    </div>
  );
}
