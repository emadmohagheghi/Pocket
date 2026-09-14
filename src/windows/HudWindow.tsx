import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";

/**
 * Passive overlay window driven entirely from Rust (see src-tauri/src/hud.rs):
 * a dark pill at the bottom-center of the active monitor that reads
 * "Captured" after a hotkey text capture, or stays on "Recording…" while a
 * held Shift+Shift capture is live. It never takes focus or input.
 */
export default function HudWindow() {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.background = "transparent";
  }, []);

  useEffect(() => {
    const unlisten = listen<{ text: string; sticky: boolean }>(
      "hud-message",
      (event) => {
        setText(event.payload.text || null);
      }
    );
    return () => {
      void unlisten.then((u) => u());
    };
  }, []);

  if (!text) return null;

  return (
    <div className="flex h-screen items-end justify-center bg-transparent p-0">
      <div
        data-tauri-drag-region="false"
        className={
          "mb-0 select-none rounded-full bg-neutral-900 px-7 py-3 text-[17px] font-semibold leading-6 text-white shadow-[0_8px_28px_rgba(0,0,0,0.45)] ring-1 ring-white/10 " +
          (text === "Recording…" ? "animate-pulse" : "")
        }
      >
        {text}
      </div>
    </div>
  );
}
