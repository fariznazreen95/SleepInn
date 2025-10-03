// web/src/routes/ProtectedHostRoute.tsx
import { ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSession } from "../lib/useSession";

/**
 * Friendly UI guard:
 * - While loading: small “checking” card
 * - If not logged in: show login card
 * - If logged in but not host/admin: show “host access required” card
 * - Else: render children
 *
 * No redirects and no changes to server auth.
 */
export function ProtectedHostRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();
  const [armed, setArmed] = useState(false);

  // Avoid UI flash while session is loading
  useEffect(() => {
    if (!loading) setArmed(true);
  }, [loading]);

  if (loading || !armed) {
    return (
      <div className="min-h-[40vh] grid place-items-center">
        <div className="rounded-2xl border border-slate-700/50 bg-slate-900/40 p-6">
          Checking session…
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <div className="w-full max-w-lg text-center rounded-2xl border border-slate-700/50 bg-slate-900/40 p-8">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-slate-800/80 ring-1 ring-slate-700/50 grid place-items-center">
            <span className="text-xl">🔐</span>
          </div>
          <h2 className="text-lg font-semibold">You need to log in</h2>
          <p className="mt-1 text-slate-300">Sign in to access host tools.</p>
          <div className="mt-6 flex items-center justify-center gap-2">
            <Link to="/login" className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm">
              Log in
            </Link>
            <Link to="/" className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm">
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (user.role !== "host" && user.role !== "admin") {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <div className="w-full max-w-lg text-center rounded-2xl border border-slate-700/50 bg-slate-900/40 p-8">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-slate-800/80 ring-1 ring-slate-700/50 grid place-items-center">
            <span className="text-xl">🚫</span>
          </div>
        <h2 className="text-lg font-semibold">Host access required</h2>
          <p className="mt-1 text-slate-300">Your account isn’t a host. You can still browse trips.</p>
          <div className="mt-6 flex items-center justify-center gap-2">
            <Link to="/trips" className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm">
              My Trips
            </Link>
            <Link to="/" className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm">
              Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
