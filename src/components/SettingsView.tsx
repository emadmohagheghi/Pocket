import { useCallback, useEffect, useState } from "react";
import { open as openFile, save } from "@tauri-apps/plugin-dialog";
import {
  Download,
  FolderOpen,
  HardDrive,
  History,
  LoaderCircle,
  NotebookPen,
  Palette,
  Rocket,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
} from "lucide-react";

import { usePocket } from "@/store";
import { api } from "@/lib/api";
import { cn, formatBytes } from "@/lib/utils";
import {
  arePocketSoundsEnabled,
  playPocketSound,
  setPocketSoundsEnabled,
} from "@/lib/sound";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Settings, StorageInfo } from "@/types";

const NOTE_PREVIEW_OPTIONS = [
  { value: "1", label: "1", ariaLabel: "1 line" },
  { value: "2", label: "2", ariaLabel: "2 lines" },
  { value: "3", label: "3", ariaLabel: "3 lines" },
  { value: "4", label: "4", ariaLabel: "4 lines" },
  { value: "5", label: "5", ariaLabel: "5 lines" },
  { value: "6", label: "6", ariaLabel: "6 lines" },
  { value: "0", label: "Full", ariaLabel: "Show full note" },
] as const;

type SettingsTab = "general" | "privacy";

export function SettingsView() {
  const settings = usePocket((s) => s.settings);
  const setSettings = usePocket((s) => s.setSettings);
  const workspaces = usePocket((s) => s.workspaces);
  const [tab, setTab] = useState<SettingsTab>("general");
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [storageFailed, setStorageFailed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [soundsEnabled, setSoundsEnabled] = useState(arePocketSoundsEnabled);
  const [backupStatus, setBackupStatus] = useState<{
    tone: "ok" | "err";
    text: string;
  } | null>(null);

  const loadStorage = useCallback(() => {
    setStorageFailed(false);
    void api
      .getStorageInfo()
      .then(setStorage)
      .catch(() => setStorageFailed(true));
  }, []);

  useEffect(() => {
    loadStorage();
  }, [loadStorage]);

  // Storage only matters on the Privacy tab, and an import changes what is
  // stored — refresh whenever the tab is shown without data yet.
  useEffect(() => {
    if (tab === "privacy" && !storage && !storageFailed) loadStorage();
  }, [tab, storage, storageFailed, loadStorage]);

  const totals = workspaces.reduce(
    (acc, w) => ({
      workspaces: acc.workspaces + 1,
      notes: acc.notes + w.counts.texts,
      voice: acc.voice + w.counts.recordings,
    }),
    { workspaces: 0, notes: 0, voice: 0 }
  );

  const exportBackup = async () => {
    setExporting(true);
    setBackupStatus(null);
    try {
      const date = new Date().toISOString().slice(0, 10);
      const path = await save({
        defaultPath: `pocket-backup-${date}.zip`,
        filters: [{ name: "Pocket backup", extensions: ["zip"] }],
      });
      if (!path) return;

      const summary = await api.exportBackup(path);
      playPocketSound("success");
      setBackupStatus({
        tone: "ok",
        text: `Exported ${summary.items} ${summary.items === 1 ? "note" : "notes"} and ${summary.recordings} voice ${summary.recordings === 1 ? "note" : "notes"}.`,
      });
    } catch {
      playPocketSound("error");
      setBackupStatus({ tone: "err", text: "Export failed. Please try again." });
    } finally {
      setExporting(false);
    }
  };

  const importBackup = async () => {
    setImporting(true);
    setBackupStatus(null);
    try {
      const path = await openFile({
        multiple: false,
        directory: false,
        filters: [{ name: "Pocket backup", extensions: ["zip"] }],
      });
      if (typeof path !== "string") return;

      const summary = await api.importBackup(path);
      playPocketSound("success");
      setBackupStatus({
        tone: "ok",
        text: `Imported ${summary.itemsImported} ${summary.itemsImported === 1 ? "note" : "notes"} and ${summary.recordingsImported} voice ${summary.recordingsImported === 1 ? "note" : "notes"} (merged, nothing overwritten).`,
      });
      loadStorage();
    } catch {
      playPocketSound("error");
      setBackupStatus({ tone: "err", text: "Import failed. Please try again." });
    } finally {
      setImporting(false);
    }
  };

  if (!settings) return null;

  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      {/* Segmented tab bar: pill container (p-1) with pill options, so the
          nested radius rule holds trivially (full − 4px ≈ full). */}
      <div
        role="tablist"
        aria-label="Settings sections"
        className="grid shrink-0 grid-cols-2 gap-1 rounded-full border border-border/60 bg-muted/60 p-1"
      >
        <TabButton
          active={tab === "general"}
          onClick={() => setTab("general")}
          icon={<SlidersHorizontal className="size-3.5" aria-hidden />}
          label="General"
          tabId="settings-tab-general"
          panelId="settings-panel-general"
        />
        <TabButton
          active={tab === "privacy"}
          onClick={() => setTab("privacy")}
          icon={<ShieldCheck className="size-3.5" aria-hidden />}
          label="Privacy & Storage"
          tabId="settings-tab-privacy"
          panelId="settings-panel-privacy"
        />
      </div>

      {tab === "general" ? (
        <div
          role="tabpanel"
          id="settings-panel-general"
          aria-labelledby="settings-tab-general"
          className="flex min-w-0 flex-col gap-3"
        >
          <Card icon={<Rocket className="size-3.5" aria-hidden />} title="Startup">
            <Row label="Launch on startup">
              <Switch
                checked={settings.launchOnStartup}
                onCheckedChange={(v) => void setSettings({ launchOnStartup: v })}
                aria-label="Launch on startup"
              />
            </Row>
            <Row label="Start minimized">
              <Switch
                checked={settings.startMinimized}
                onCheckedChange={(v) => void setSettings({ startMinimized: v })}
                aria-label="Start minimized"
              />
            </Row>
          </Card>

          <Card icon={<Palette className="size-3.5" aria-hidden />} title="Appearance & sound">
            <Row label="Theme">
              <Select
                value={settings.theme}
                onValueChange={(v) => void setSettings({ theme: v as Settings["theme"] })}
              >
                <SelectTrigger className="w-32 rounded-xl" aria-label="Theme">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="system">System</SelectItem>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Row>
            <Row
              label="Interface sounds"
              description="Quiet cues for saves, copies and recording actions"
            >
              <Switch
                checked={soundsEnabled}
                onCheckedChange={(enabled) => {
                  if (!enabled) playPocketSound("toggleOff");
                  setSoundsEnabled(enabled);
                  setPocketSoundsEnabled(enabled);
                  if (enabled) playPocketSound("toggleOn");
                }}
                aria-label="Interface sounds"
              />
            </Row>
          </Card>

          <Card icon={<NotebookPen className="size-3.5" aria-hidden />} title="Notes">
            <Row label="Note preview">
              <ToggleGroup
                type="single"
                size="sm"
                variant="outline"
                spacing={0}
                value={String(settings.notePreviewLines)}
                aria-label="Note preview line limit"
                onValueChange={(value) => {
                  if (value) void setSettings({ notePreviewLines: Number(value) });
                }}
              >
                {NOTE_PREVIEW_OPTIONS.map((option) => (
                  <ToggleGroupItem
                    key={option.value}
                    value={option.value}
                    aria-label={option.ariaLabel}
                  >
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Row>
            <Row label="Gaming mode" description="Temporarily unavailable">
              <Switch
                checked={false}
                disabled
                aria-label="Gaming mode detection"
              />
            </Row>
          </Card>
        </div>
      ) : (
        <div
          role="tabpanel"
          id="settings-panel-privacy"
          aria-labelledby="settings-tab-privacy"
          className="flex min-w-0 flex-col gap-3"
        >
          <Card
            icon={<ShieldCheck className="size-3.5" aria-hidden />}
            title="Private by design"
          >
            {/* Tinted inset panel: card radius (24) minus card padding (12)
                gives the 12px row/panel radius used throughout. */}
            <div className="rounded-xl bg-muted/50 px-3 py-2.5">
              <ul className="space-y-1 text-[13px] leading-snug text-muted-foreground">
                <li>No account, no cloud, no telemetry.</li>
                <li>Text and voice stay on this machine only.</li>
                <li>Recordings are never uploaded anywhere.</li>
              </ul>
            </div>
            <div
              className="grid grid-cols-3 gap-2"
              aria-label="Library overview"
            >
              <Stat label="Notes" value={String(totals.notes)} />
              <Stat label="Voice" value={String(totals.voice)} />
              <Stat
                label="Storage"
                value={storage ? formatBytes(storage.sizeBytes) : "…"}
              />
            </div>
          </Card>

          <Card
            icon={<HardDrive className="size-3.5" aria-hidden />}
            title="Storage location"
          >
            {storageFailed && !storage ? (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2.5">
                <p className="text-[13px] text-muted-foreground">
                  Couldn&apos;t read storage info.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 rounded-xl"
                  onClick={loadStorage}
                >
                  <RotateCcw data-icon="inline-start" /> Retry
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2.5">
                <div className="min-w-0">
                  {storage?.usesFallbackLocation && (
                    <Badge variant="secondary" className="mb-1 text-[10px]">
                      install folder not writable — using app data
                    </Badge>
                  )}
                  <p
                    className={cn(
                      "truncate font-mono text-xs text-muted-foreground",
                      !storage && "animate-pulse"
                    )}
                  >
                    {storage?.dataDir ?? "Loading…"}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 rounded-xl"
                  disabled={!storage}
                  onClick={() => void api.openDataFolder().catch(() => {})}
                >
                  <FolderOpen data-icon="inline-start" /> Open folder
                </Button>
              </div>
            )}
          </Card>

          <Card
            icon={<History className="size-3.5" aria-hidden />}
            title="Backup & restore"
            description="A portable .zip of everything. Import merges a backup into your current library — nothing is overwritten."
          >
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="h-9 flex-1 rounded-xl"
                disabled={exporting || importing}
                onClick={() => void exportBackup()}
              >
                {exporting ? (
                  <LoaderCircle data-icon="inline-start" className="animate-spin" />
                ) : (
                  <Download data-icon="inline-start" />
                )}
                {exporting ? "Exporting…" : "Export"}
              </Button>
              <Button
                variant="outline"
                className="h-9 flex-1 rounded-xl"
                disabled={exporting || importing}
                onClick={() => void importBackup()}
              >
                {importing ? (
                  <LoaderCircle data-icon="inline-start" className="animate-spin" />
                ) : (
                  <Upload data-icon="inline-start" />
                )}
                {importing ? "Importing…" : "Import"}
              </Button>
            </div>
            {backupStatus && (
              <p
                aria-live="polite"
                className={cn(
                  "rounded-xl px-3 py-2 text-xs leading-snug",
                  backupStatus.tone === "ok"
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "bg-destructive/10 text-destructive"
                )}
              >
                {backupStatus.text}
              </p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  tabId,
  panelId,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  tabId: string;
  panelId: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={tabId}
      aria-selected={active}
      aria-controls={panelId}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/* Grouped settings card. Outer radius 24px with 8px padding leaves 16px
   for the nested rows (inner = outer − padding), so rows use rounded-2xl
   and tinted inset panels use rounded-xl (24 − 12). */
function Card({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-border/60 bg-card p-2">
      <div className="flex items-center gap-2 px-3 pb-1 pt-2">
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="text-[13px] font-semibold">{title}</h2>
      </div>
      {description ? (
        <p className="px-3 pb-2 text-xs leading-snug text-muted-foreground">
          {description}
        </p>
      ) : null}
      <div className="flex flex-col gap-0.5">{children}</div>
    </section>
  );
}

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl px-3 py-2.5 transition-colors hover:bg-muted/60 focus-within:bg-muted/60">
      <div className="min-w-0">
        <Label className="text-[13px]">{label}</Label>
        {description ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-muted/50 px-3 py-2">
      <p className="truncate text-sm font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

/** Settings fills the main Pocket surface without resizing the native window. */
export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        closeButtonClassName="right-4 top-4"
        className="inset-3 flex h-auto w-auto max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-[36px] bg-background p-0 sm:max-w-none"
      >
        {/* Dialog title bar doubles as the window drag handle: the heading
            text drags, the close button stays clickable. */}
        <DialogHeader
          data-tauri-drag-region="deep"
          className="shrink-0 border-b px-5 pb-3 pt-4"
        >
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Tune Pocket to your workflow. Everything stays on this device.
          </DialogDescription>
        </DialogHeader>
        <div className="scroll-fade min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-3">
          <SettingsView />
        </div>
      </DialogContent>
    </Dialog>
  );
}
