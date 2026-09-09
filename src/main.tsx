import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
// Enables data-tauri-drag-region for the frameless main window (Tauri does
// not wire this attribute up itself in the version we build against).
import "./lib/drag-region";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
