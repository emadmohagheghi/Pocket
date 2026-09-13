import { useEffect, useState } from "react";
import { open as openFile, save } from "@tauri-apps/plugin-dialog";
import {
  Download,
  FolderOpen,
  LoaderCircle,
  MonitorCog,
  ShieldCheck,
  Upload,
} from "lucide-react";

import { usePocket } from "@/store";
import { api } from "@/lib/api";
import { formatBytes } from "@/lib/utils";
import {
  arePocketSoundsEnabled,
  playPocketSound,
  setPocketSoundsEnabled,
} from "@/lib/sound";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import {
  Dialog,
  DialogContent,
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

export function SettingsView() {
  const settings = usePocket((s) => s.settings);
  const setSettings = usePocket((s) => s.setSettings);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [soundsEnabled, setSoundsEnabled] = useState(arePocketSoundsEnabled);

  useEffect(() => {
    void api.getStorageInfo().then(setStorage).catch(() => {});
  }, []);

  const exportBackup = async () => {
    setExporting(true);
    try {
      const date = new Date().toISOString().slice(0, 10);
      const path = await save({
        defaultPath: `pocket-backup-${date}.zip`,
        filters: [{ name: "Pocket backup", extensions: ["zip"] }],
      });
      if (!path) return;

      await api.exportBackup(path);
      playPocketSound("success");
    } catch {
      playPocketSound("error");
    } finally {
      setExporting(false);
    }
  };

  const importBackup = async () => {
    setImporting(true);
    try {
      const path = await openFile({
        multiple: false,
        directory: false,
        filters: [{ name: "Pocket backup", extensions: ["zip"] }],
      });
      if (typeof path !== "string") return;

      await api.importBackup(path);
      playPocketSound("success");
    } catch {
      playPocketSound("error");
    } finally {
      setImporting(false);
    }
  };

  if (!settings) return null;

  return (
    <div className="flex w-full max-w-full min-w-0 flex-col gap-6 px-1 pb-2">
      <Section icon={<MonitorCog className="size-4" />} title="General">
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
        <Row label="Theme">
          <Select value={settings.theme} onValueChange={(v) => void setSettings({ theme: v as Settings["theme"] })}>
            <SelectTrigger className="w-32" aria-label="Theme">
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
        <Row label="Interface sounds" description="Quiet cues for saves, copies and recording actions">
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
      </Section>

      <Section icon={<ShieldCheck className="size-4" />} title="Privacy & Storage">
        <div className="rounded-lg border bg-card p-4">
          <ul className="space-y-1.5 text-[13px] text-muted-foreground">
            <li>· Pocket has no account, no cloud and no telemetry.</li>
            <li>· Everything — text and voice recordings — is stored on this machine only.</li>
            <li>· Voice recordings are never uploaded anywhere.</li>
          </ul>
          <Separator className="my-3" />
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[13px] font-medium">Storage location</p>
                {storage?.usesFallbackLocation && (
                  <Badge variant="secondary" className="text-[10px]">
                    install folder not writable — using app data
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                {storage?.dataDir ?? "…"}
              </p>
              {storage && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Total size: {formatBytes(storage.sizeBytes)}
                </p>
              )}
            </div>
            <Button
              variant="outline"
              className="shrink-0"
              onClick={() => void api.openDataFolder().catch(() => {})}
            >
              <FolderOpen className="size-4" /> Open folder
            </Button>
          </div>
          <Separator className="my-3" />
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
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
            <Button
              variant="outline"
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
          </div>
        </div>
      </Section>

    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="space-y-2">{children}</div>
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
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-card px-3 py-2.5">
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

/** Settings fills the main Pocket surface without resizing the native window. */
export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        data-tauri-drag-region="deep"
        closeButtonClassName="right-4 top-4"
        className="inset-3 flex h-auto w-auto max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-3xl bg-background p-0 sm:max-w-none"
      >
        <div data-tauri-drag-region className="h-5 w-full shrink-0" aria-hidden />
        <DialogHeader className="shrink-0 border-b px-5 pb-4">
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="scroll-fade min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4">
          <SettingsView />
        </div>
      </DialogContent>
    </Dialog>
  );
}
