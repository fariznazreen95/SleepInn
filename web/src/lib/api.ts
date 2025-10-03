import { API } from "./config";

export async function api(path: string, opts: RequestInit = {}) {
  // Redirect /api/listings?start=&end=... -> /api/listings/search?...  (keep all other params)
  let url = `${API}${path}`;
  try {
    const u = new URL(url);
    // normalize: work only for the plain listings endpoint
    if (
      u.pathname === "/api/listings" &&
      u.searchParams.has("start") &&
      u.searchParams.has("end")
    ) {
      u.pathname = "/api/listings/search";
      url = u.toString();
    }
  } catch {
    // if path isn't a valid URL, keep original behavior
  }

  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });

  if (!res.ok) {
    // Try to surface JSON error nicely; else fall back
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = (j as any)?.error || msg;
    } catch {
      try {
        msg = await res.text();
      } catch {
        /* ignore */
      }
    }
    throw new Error(msg || `HTTP ${res.status}`);
  }

  try {
    return await res.json();
  } catch {
    return {};
  }
}

// ---- Auth helpers ----
export async function logout(): Promise<void> {
  await api("/api/auth/logout", { method: "POST" });
}
