import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import Root from "./Root"; // we'll create this next

// ANCHOR: URL-REWRITE-TRAP
(() => {
  const orig = history.replaceState;
  history.replaceState = function (...args: any[]) {
    try {
      const url = args?.[2];
      const stack = new Error().stack?.split("\n").slice(0, 6).join("\n");
      console.log("[replaceState]", url, "\n", stack);
    } catch {}
    // @ts-ignore
    return orig.apply(this, args);
  };
})();
// ANCHOR: URL-REWRITE-TRAP-END

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Root />
    </BrowserRouter>
  </React.StrictMode>
);
