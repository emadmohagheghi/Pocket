export type ItemType = "text";
export type EntryKind = "text" | "voice";
export type PinControlStyle =
  | "hover-toolbar"
  | "metadata"
  | "leading"
  | "bottom-bar"
  | "drag";

export interface Item {
  id: string;
  itemType: ItemType;
  content: string;
  title: string | null;
  url: string | null;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Recording {
  id: string;
  name: string;
  file: string;
  durationMs: number;
  sizeBytes: number;
  pinned: boolean;
  createdAt: number;
}

export interface WorkspaceData {
  items: Item[];
  recordings: Recording[];
}

export interface Counts {
  texts: number;
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
  activeWorkspaceId: string;
  gamingDetectionEnabled: boolean;
  theme: "system" | "light" | "dark";
  /** 0 shows the full note; 1–6 sets the collapsed preview height. */
  notePreviewLines: number;
  /** Temporary comparison switch for the five candidate pin interactions. */
  pinControlStyle: PinControlStyle;
}

export interface StorageInfo {
  dataDir: string;
  sizeBytes: number;
  usesFallbackLocation: boolean;
}

export interface ExportSummary {
  path: string;
  workspaces: number;
  items: number;
  recordings: number;
  audioFiles: number;
  missingAudio: number;
}

export interface ImportSummary {
  workspacesCreated: number;
  workspacesMerged: number;
  itemsImported: number;
  itemsSkipped: number;
  recordingsImported: number;
  recordingsSkipped: number;
  audioFilesRestored: number;
  missingAudio: number;
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
  createdAt: number;
}

export interface StateChangedPayload {
  settings: Settings;
  workspaces: WorkspaceInfo[];
}
