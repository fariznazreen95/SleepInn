import { Outlet } from "react-router-dom";
import Header from "../components/Header";
import Footer from "../components/Footer";

const CONTAINER: React.CSSProperties = {
  maxWidth: 1152,
  margin: "0 auto",
  padding: "0 16px"
};

export default function AppLayout() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Header />
      <main style={{ flex: 1, paddingTop: 8 }}>
        <div style={CONTAINER}>
          <Outlet />
        </div>
      </main>
      <Footer />
    </div>
  );
}
