import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
// Whole-window dragging for the frameless windows: everything drags by
// default, interactive elements (buttons, inputs, menus) opt out. Tauri's
// stock drag-region handling isn't used in the version we build against.
import "./lib/drag-region";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
