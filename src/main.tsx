import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@adsum/tokens/tokens.css";
import { App } from "./App.js";
import { registerServiceWorker } from "./offline.js";
import "./styles.css";

registerServiceWorker();

// Polyfill crypto.randomUUID for older mobile Safari (< 15.4) where it is missing.
if (typeof crypto !== "undefined" && typeof crypto.randomUUID !== "function" && crypto.getRandomValues) {
  (crypto as unknown as Record<"randomUUID", () => string>).randomUUID = (): string => {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6]! & 0x0f) | 0x40;
    b[8] = (b[8]! & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };
}

const container = document.getElementById("root");
if (!container) {
  throw new Error("root element not found");
}
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
