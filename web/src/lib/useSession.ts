import { useEffect, useState } from "react";
import { API } from "./config";

export function useSession() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/me`, { credentials: "include" })
    .then(r => (r.ok ? r.json() : null))
    .then(d => {
      if (!d) return setUser(null);
      setUser((d as any).user ?? d);   // accepts flat or { user }
    })
    .catch(() => setUser(null))
    .finally(() => setLoading(false));
    }, []);

  return { user, loading };
}
