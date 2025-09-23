import { Routes, Route } from "react-router-dom";
import App from "./App";
import ListingDetails from "./pages/ListingDetails";
import Login from "./pages/auth/Login";
import HostDashboard from "./pages/host/Dashboard";
import EditListing from "./pages/host/EditListing";
import { ProtectedHostRoute } from "./routes/ProtectedHostRoute";
import ChangePassword from "./pages/auth/ChangePassword";


export default function Root() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<App />} />
      <Route path="/listing/:id" element={<ListingDetails />} />
      <Route path="/login" element={<Login />} />

      <Route
        path="/change-password"
        element={
          <ProtectedHostRoute>
            <ChangePassword />
          </ProtectedHostRoute>
        }
      />


      {/* Host (protected) */}
      <Route
        path="/host"
        element={
          <ProtectedHostRoute>
            <HostDashboard />
          </ProtectedHostRoute>
        }
      />
      <Route
        path="/host/new"
        element={
          <ProtectedHostRoute>
            <EditListing />
          </ProtectedHostRoute>
        }
      />
      <Route
        path="/host/:id/edit"
        element={
          <ProtectedHostRoute>
            <EditListing />
          </ProtectedHostRoute>
        }
      />
    </Routes>
  );
}
