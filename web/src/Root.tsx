import { Routes, Route } from "react-router-dom";
import App from "./App"; // your current grid + filters
import ListingDetails from "./pages/ListingDetails"; // stub we add in step E

export default function Root() {
  return (
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/listing/:id" element={<ListingDetails />} />
    </Routes>
  );
}
