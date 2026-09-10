import { useEffect } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Toaster } from "@/components/ui/sonner";

import MainWindow from "@/windows/MainWindow";
import QuickCaptureWindow from "@/windows/QuickCaptureWindow";

export default function App() {
  const label = getCurrentWebviewWindow().label;

  useEffect(() => {
    document.title = label === "quick-capture" ? "Pocket Capture" : "Pocket";
  }, [label]);

  useEffect(() => {
    // Make every non-interactive part of every Pocket window draggable,
    // including content rendered through Radix portals. The vendored Tauri
    // drag handler still excludes inputs, buttons and other controls so their
    // normal click/type behavior is preserved.
    document.body.setAttribute("data-tauri-drag-region", "deep");
    return () => document.body.removeAttribute("data-tauri-drag-region");
  }, []);

  return (
    <>
      {label === "quick-capture" ? <QuickCaptureWindow /> : <MainWindow />}
      <Toaster position={label === "quick-capture" ? "bottom-center" : "bottom-right"} />
    </>
  );
}
