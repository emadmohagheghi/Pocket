import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";

import { api } from "@/lib/api";
import type {
  Item,
  ItemType,
  Section,
  Settings,
  StateChangedPayload,
  WorkspaceData,
  WorkspaceInfo,
} from "@/types";

function errMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}

interface PocketStore {
  ready: boolean;
  settings: Settings | null;
  workspaces: WorkspaceInfo[];
  data: WorkspaceData | null;
  view: Section;
  /** Item to scroll to + highlight (from search). */
  focusItemId: string | null;
  gaming: boolean;

  init: () => Promise<void>;
  setView: (v: Section) => void;
  setFocusItem: (id: string | null) => void;
  refreshItems: () => Promise<void>;

  createWorkspace: (name: string) => Promise<WorkspaceInfo | null>;
  renameWorkspace: (id: string, name: string) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  setActiveWorkspace: (id: string) => Promise<void>;

  createItem: (type: ItemType, content: string) => Promise<Item | null>;
  updateItem: (itemId: string, patch: Partial<Item>) => Promise<void>;
  deleteItem: (itemId: string) => Promise<void>;
  moveItem: (itemId: string, beforeId: string | null) => Promise<void>;

  renameRecording: (recordingId: string, name: string) => Promise<void>;
  deleteRecording: (recordingId: string) => Promise<void>;

  setSettings: (patch: Partial<Settings>) => Promise<void>;
}

export const activeWorkspaceId = (s: PocketStore): string =>
  s.settings?.activeWorkspaceId ?? "";

export const usePocket = create<PocketStore>((set, get) => ({
  ready: false,
  settings: null,
  workspaces: [],
  data: null,
  view: "inbox",
  focusItemId: null,
  gaming: false,

  init: async () => {
    // Backend → frontend event wiring (registered once).
    await listen<StateChangedPayload>("state-changed", (e) => {
      const prevActive = get().settings?.activeWorkspaceId;
      const { settings, workspaces } = e.payload;
      set({ settings, workspaces });
      if (settings.activeWorkspaceId !== prevActive) {
        void get().refreshItems();
      }
    });
    await listen<{ workspaceId: string; data: WorkspaceData }>(
      "items-changed",
      (e) => {
        if (e.payload.workspaceId === get().settings?.activeWorkspaceId) {
          set({ data: e.payload.data });
        }
      }
    );
    await listen<boolean>("gaming-mode-changed", (e) => set({ gaming: e.payload }));

    try {
      const initial = await api.getState();
      set({
        settings: initial.settings,
        workspaces: initial.workspaces,
      });
      await get().refreshItems();
      set({ ready: true });
    } catch (e) {
      toast.error(`Failed to load data: ${errMessage(e)}`);
      set({ ready: true });
    }

    void api
      .getGamingState()
      .then((g) => set({ gaming: g }))
      .catch(() => {});
  },

  setView: (view) => set({ view, focusItemId: null }),
  setFocusItem: (focusItemId) => set({ focusItemId }),

  refreshItems: async () => {
    const wsId = get().settings?.activeWorkspaceId;
    if (!wsId) return;
    try {
      const data = await api.getItems(wsId);
      set({ data });
    } catch (e) {
      toast.error(`Failed to load items: ${errMessage(e)}`);
    }
  },

  createWorkspace: async (name) => {
    try {
      const ws = await api.createWorkspace(name);
      set((s) => ({ workspaces: [...s.workspaces, ws] }));
      return ws;
    } catch (e) {
      toast.error(errMessage(e));
      return null;
    }
  },

  renameWorkspace: async (id, name) => {
    try {
      const ws = await api.renameWorkspace(id, name);
      set((s) => ({
        workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, name: ws.name } : w)),
      }));
    } catch (e) {
      toast.error(errMessage(e));
    }
  },

  deleteWorkspace: async (id) => {
    try {
      await api.deleteWorkspace(id);
    } catch (e) {
      toast.error(errMessage(e));
    }
  },

  setActiveWorkspace: async (id) => {
    try {
      await api.setActiveWorkspace(id);
      // The state-changed event refreshes everything else.
    } catch (e) {
      toast.error(errMessage(e));
    }
  },

  createItem: async (type, content) => {
    const wsId = get().settings?.activeWorkspaceId;
    if (!wsId || !content.trim()) return null;
    try {
      const item = await api.createItem(wsId, { itemType: type, content });
      return item;
    } catch (e) {
      toast.error(errMessage(e));
      return null;
    }
  },

  updateItem: async (itemId, patch) => {
    const wsId = get().settings?.activeWorkspaceId;
    if (!wsId) return;
    try {
      await api.updateItem(wsId, itemId, patch as Record<string, unknown>);
    } catch (e) {
      toast.error(errMessage(e));
    }
  },

  deleteItem: async (itemId) => {
    const wsId = get().settings?.activeWorkspaceId;
    if (!wsId) return;
    try {
      await api.deleteItem(wsId, itemId);
    } catch (e) {
      toast.error(errMessage(e));
    }
  },

  moveItem: async (itemId, beforeId) => {
    const wsId = get().settings?.activeWorkspaceId;
    if (!wsId) return;
    try {
      await api.moveItem(wsId, itemId, beforeId);
    } catch (e) {
      toast.error(errMessage(e));
    }
  },

  renameRecording: async (recordingId, name) => {
    const wsId = get().settings?.activeWorkspaceId;
    if (!wsId) return;
    try {
      await api.renameRecording(wsId, recordingId, name);
    } catch (e) {
      toast.error(errMessage(e));
    }
  },

  deleteRecording: async (recordingId) => {
    const wsId = get().settings?.activeWorkspaceId;
    if (!wsId) return;
    try {
      await api.deleteRecording(wsId, recordingId);
    } catch (e) {
      toast.error(errMessage(e));
    }
  },

  setSettings: async (patch) => {
    try {
      const settings = await api.updateSettings(patch);
      set((s) => ({ settings: s.settings ? { ...s.settings, ...settings } : settings }));
    } catch (e) {
      toast.error(errMessage(e));
    }
  },
}));
