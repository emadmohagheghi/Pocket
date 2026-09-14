import { useEffect } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

import MainWindow from "@/windows/MainWindow";
import QuickCaptureWindow from "@/windows/QuickCaptureWindow";
import HudWindow from "@/windows/HudWindow";

export default function App() {
  const label = getCurrentWebviewWindow().label;

  useEffect(() => {
    document.title = label === "quick-capture" ? "Pocket Capture" : "Pocket";
  }, [label]);

  if (label.startsWith("hud")) return <HudWindow />;
  return label === "quick-capture" ? <QuickCaptureWindow /> : <MainWindow />;
}
