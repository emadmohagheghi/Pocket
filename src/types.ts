export type ItemType = "text";

export interface Item {
  id: string;
  itemType: ItemType;
  content: string;
  title: string | null;
  url: string | null;
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
