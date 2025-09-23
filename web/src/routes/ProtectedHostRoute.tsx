import { ReactNode, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../lib/useSession";

export function ProtectedHostRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();
  const nav = useNavigate();

  useEffect(() => {
    if (!loading) {
      if (!user) nav("/login", { replace: true });
      else if (user.role !== "host" && user.role !== "admin") nav("/", { replace: true });
    }
  }, [loading, user, nav]);

  if (loading) return <div style={{ padding: 24 }}>Checking session…</div>;
  if (!user) return null;
  if (user.role !== "host" && user.role !== "admin") return null;

  return <>{children}</>;
}
