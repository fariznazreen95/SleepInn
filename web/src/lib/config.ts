// ANCHOR: API-NORMALIZE
const RAW = (import.meta.env.VITE_API_URL ?? "http://localhost:5174").trim();
// strip trailing slashes and a trailing "/api" if someone put it in the env
export const API = RAW.replace(/\/+$/g, "").replace(/\/api$/i, "");
