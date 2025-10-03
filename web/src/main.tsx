// web/src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import Root from "./Root";
import { ToastProvider } from "./components/Toast";
import "./index.css"; // keep if you have it; safe to leave

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ToastProvider>
      <BrowserRouter>
        <Root />
      </BrowserRouter>
    </ToastProvider>
  </React.StrictMode>
);
