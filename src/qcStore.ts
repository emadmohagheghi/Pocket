import { useEffect } from "react";
import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";

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
      toast.error(String(e));
    }
  },
}));

let wired = false;

export function useQcEvents(onCaptureOpen: (mode: CaptureOpenMode) => void) {
  useEffect(() => {
    if (!wired) {
      wired = true;
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
        onCaptureOpen(e.payload.mode);
      }
    );
    return () => {
      void unlistenP.then((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
