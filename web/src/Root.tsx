// web/src/Root.tsx
import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";

import App from "./App";
import ListingDetails from "./pages/ListingDetails";

import Login from "./pages/auth/Login";
import ChangePassword from "./pages/auth/ChangePassword";

import MyTrips from "./pages/trips/MyTrips";
import Checkout from "./pages/checkout/Checkout";
import Success from "./pages/checkout/Success";

import HostDashboard from "./pages/host/Dashboard";
import HostBookings from "./pages/host/Bookings";
import HostListings from "./pages/host/Listings";
import EditListing from "./pages/host/EditListing";

import { ProtectedHostRoute } from "./routes/ProtectedHostRoute";
import AppLayout from "./layout/AppLayout";
import NotFound from "./pages/NotFound";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:5174";

// DevGuard: auto-reload the web app if the API version changed
function useServerVersionHardReload() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API}/api/health`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return;
        const headerVer = res.headers.get("X-Server-Version");
        const body = headerVer ? null : await res.json();
        const ver = headerVer || body?.version || "";
        if (!ver) return;

        const KEY = "sleepinn_server_version";
        const prev = localStorage.getItem(KEY);

        if (prev && prev !== ver) {
          // nuke caches, then hard reload
          if ("caches" in window) {
            const names = await caches.keys();
            await Promise.all(names.map((n) => caches.delete(n)));
          }
          localStorage.setItem(KEY, ver);
          location.reload();
        } else if (!prev) {
          localStorage.setItem(KEY, ver);
        }
      } catch {
        // ignore offline / dev restarts
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}

export default function Root() {
  // activate DevGuard check once on app mount
  useServerVersionHardReload();

  return (
    <Routes>
      {/* Global layout wrapper (header/footer/toasts) */}
      <Route element={<AppLayout />}>
        {/* Home */}
        <Route index element={<App />} />
        <Route path="listing/:id" element={<ListingDetails />} />

        {/* Auth & account */}
        <Route path="login" element={<Login />} />
        <Route
          path="change-password"
          element={
            <ProtectedHostRoute>
              <ChangePassword />
            </ProtectedHostRoute>
          }
        />

        {/* Checkout flow */}
        <Route path="checkout" element={<Checkout />} />
        <Route path="checkout/success" element={<Success />} />

        {/* Trips */}
        <Route path="trips" element={<MyTrips />} />

        {/* Host area (protected) */}
        <Route
          path="host"
          element={
            <ProtectedHostRoute>
              <HostDashboard />
            </ProtectedHostRoute>
          }
        />
        <Route
          path="host/bookings"
          element={
            <ProtectedHostRoute>
              <HostBookings />
            </ProtectedHostRoute>
          }
        />
        <Route
          path="host/listings"
          element={
            <ProtectedHostRoute>
              <HostListings />
            </ProtectedHostRoute>
          }
        />
        <Route
          path="host/new"
          element={
            <ProtectedHostRoute>
              <EditListing />
            </ProtectedHostRoute>
          }
        />
        <Route
          path="host/new/edit"
          element={
            <ProtectedHostRoute>
              <EditListing />
            </ProtectedHostRoute>
          }
        />
        <Route
          path="host/:id/edit"
          element={
            <ProtectedHostRoute>
              <EditListing />
            </ProtectedHostRoute>
          }
        />

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
