export type ItemType = "text" | "note" | "prompt" | "task" | "link";

export interface Item {
  id: string;
  itemType: ItemType;
  content: string;
  title: string | null;
  url: string | null;
  completed: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Recording {
  id: string;
  name: string;
  file: string;
  durationMs: number;
  sizeBytes: number;
  createdAt: number;
}

export interface WorkspaceData {
  items: Item[];
  recordings: Recording[];
}

export interface Counts {
  texts: number;
  notes: number;
  prompts: number;
  tasks: number;
  links: number;
  recordings: number;
}

export interface WorkspaceInfo {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  counts: Counts;
}

export interface Settings {
  launchOnStartup: boolean;
  startMinimized: boolean;
  closeToTray: boolean;
  quickCaptureShortcut: string;
  voiceShortcut: string | null;
  activeWorkspaceId: string;
  gamingDetectionEnabled: boolean;
  theme: "system" | "light" | "dark";
}

export interface StorageInfo {
  dataDir: string;
  sizeBytes: number;
  usesFallbackLocation: boolean;
}

export interface InitialState {
  settings: Settings;
  workspaces: WorkspaceInfo[];
  storage: StorageInfo;
}

export interface SearchHit {
  kind: string;
  id: string;
  title: string;
  snippet: string;
  completed: boolean;
  createdAt: number;
}

export type Section =
  | "inbox"
  | "prompts"
  | "notes"
  | "links"
  | "tasks"
  | "voice"
  | "settings";

export interface StateChangedPayload {
  settings: Settings;
  workspaces: WorkspaceInfo[];
}
