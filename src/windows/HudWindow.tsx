import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { cn } from "@/lib/utils";

/**
 * Passive overlay window, pre-created at startup and driven by Rust through
 * the `hud-message` event (see src-tauri/src/hud.rs): a pill at the
 * bottom-center of the active monitor that reads "Captured". With no text
 * the whole window is transparent and invisible.
 *
 * The pill inverts the OS theme (light system -> dark pill, dark system ->
 * light pill) so it always stands out.
 */
export default function HudWindow() {
  const [text, setText] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get("hud")
  );
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    document.body.style.background = "transparent";
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
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
        className={cn(
          "select-none rounded-xl px-4 py-2 text-[18px] h-10",
          systemDark
            ? "bg-neutral-50 text-neutral-900"
            : "bg-neutral-900 text-neutral-50"
        )}
      >
        {text}
      </div>
    </div>
  );
}
