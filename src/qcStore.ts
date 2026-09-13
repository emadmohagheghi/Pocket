import { useEffect, useRef } from "react";
import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";

import { api } from "@/lib/api";
import type { Settings, WorkspaceInfo } from "@/types";

interface QcStore {
  settings: Settings | null;
  workspaces: WorkspaceInfo[];
  load: () => Promise<void>;
}

export type CaptureOpenMode = "voice" | "voice-hold";

/** Lightweight store for the voice-capture window (no item data needed). */
export const useQc = create<QcStore>((set) => ({
  settings: null,
  workspaces: [],
  load: async () => {
    try {
      const s = await api.getState();
      set({ settings: s.settings, workspaces: s.workspaces });
    } catch (e) {
    }
  },
}));

let wired = false;

export function useQcEvents(onCaptureOpen: (mode: CaptureOpenMode) => void) {
  // Latest-callback ref: the capture-open listener below subscribes exactly
  // once and always invokes the most recent render's callback, so callers can
  // pass an inline closure without effect-dependency churn.
  const handlerRef = useRef(onCaptureOpen);
  useEffect(() => {
    handlerRef.current = onCaptureOpen;
  });

  useEffect(() => {
    if (!wired) {
      wired = true;
      // Process-wide: the quick-capture window lives for the whole app
      // session, so this listener is intentionally never unlistened.
      void listen<{ settings: Settings; workspaces: WorkspaceInfo[] }>(
        "state-changed",
        (e) => useQc.setState(e.payload)
      );
    }
    void useQc.getState().load();
    const unlistenP = listen<{ mode: CaptureOpenMode }>(
      "capture-open",
      (e) => {
        void api.log(`QC received capture-open mode=${e.payload.mode}`);
        handlerRef.current(e.payload.mode);
      }
    );
    return () => {
      void unlistenP.then((f) => f());
    };
  }, []);
}
