import { useEffect } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

import MainWindow from "@/windows/MainWindow";
import QuickCaptureWindow from "@/windows/QuickCaptureWindow";

export default function App() {
  const label = getCurrentWebviewWindow().label;

  useEffect(() => {
    document.title = label === "quick-capture" ? "Pocket Capture" : "Pocket";
  }, [label]);

  return label === "quick-capture" ? <QuickCaptureWindow /> : <MainWindow />;
}
