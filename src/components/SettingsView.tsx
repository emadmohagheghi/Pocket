import { useCallback, useEffect, useRef, useState } from "react";
import { open as openFile, save } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import {
  Download,
  FolderOpen,
  Keyboard,
  LoaderCircle,
  MonitorCog,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";

import { usePocket } from "@/store";
import { api } from "@/lib/api";
import { acceleratorFromEvent, shortcutLabel } from "@/lib/shortcut";
import { formatBytes, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StorageInfo } from "@/types";

export function SettingsView() {
  const { settings, setSettings } = usePocket();
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

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

      const summary = await api.exportBackup(path);
      if (summary.missingAudio > 0) {
        toast.warning(
          `Backup saved, but ${summary.missingAudio} audio file(s) were missing`
        );
      } else {
        toast.success(
          `Backup exported: ${summary.items} items, ${summary.audioFiles} audio files`
        );
      }
    } catch (error) {
      toast.error(`Could not export backup: ${String(error)}`);
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

      const summary = await api.importBackup(path);
      const imported = summary.itemsImported + summary.recordingsImported;
      if (imported === 0 && summary.workspacesCreated === 0) {
        toast.info("This backup is already imported");
      } else if (summary.missingAudio > 0) {
        toast.warning(
          `Imported ${imported} item(s); ${summary.missingAudio} audio file(s) were unavailable`
        );
      } else {
        toast.success(
          `Imported ${summary.itemsImported} items and ${summary.audioFilesRestored} audio files`
        );
      }
    } catch (error) {
      toast.error(`Could not import backup: ${String(error)}`);
    } finally {
      setImporting(false);
    }
  };

  if (!settings) return null;

  return (
    <div className="w-full max-w-full min-w-0 space-y-6 px-1 pb-2">
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
        <Row label="Close to system tray">
          <Switch
            checked={settings.closeToTray}
            onCheckedChange={(v) => void setSettings({ closeToTray: v })}
            aria-label="Close to system tray"
          />
        </Row>
        <Row label="Theme">
          <Select value={settings.theme} onValueChange={(v) => void setSettings({ theme: v as never })}>
            <SelectTrigger className="w-32" aria-label="Theme">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">System</SelectItem>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
            </SelectContent>
          </Select>
        </Row>
      </Section>

      <Section icon={<Keyboard className="size-4" />} title="Shortcuts">
        <Row
          label="Quick capture"
        >
          <div className="flex items-center gap-2">
            <Select
              value={settings.quickCaptureShortcut === "DoubleShift" ? "DoubleShift" : "custom"}
              onValueChange={(v) => {
                if (v === "DoubleShift") {
                  void api
                    .setShortcut("quickCapture", "DoubleShift")
                    .then(() => { toast.success("Quick capture shortcut updated"); })
                    .catch((e) => { toast.error(String(e)); });
                }
              }}
            >
              <SelectTrigger className="w-32" aria-label="Shortcut mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DoubleShift">Double Shift</SelectItem>
                <SelectItem value="custom">Custom…</SelectItem>
              </SelectContent>
            </Select>
            {settings.quickCaptureShortcut !== "DoubleShift" && (
              <ShortcutInput
                value={settings.quickCaptureShortcut}
                onSave={(accel) =>
                  api
                    .setShortcut("quickCapture", accel)
                    .then(() => { toast.success("Quick capture shortcut updated"); })
                    .catch((e) => { toast.error(String(e)); })
                }
              />
            )}
          </div>
        </Row>
        <Row label="Voice recording">
          {settings.voiceShortcut ? (
            <div className="flex items-center gap-2">
              <ShortcutInput
                value={settings.voiceShortcut}
                onSave={(accel) =>
                  api
                    .setShortcut("voice", accel)
                    .then(() => { toast.success("Voice shortcut updated"); })
                    .catch((e) => { toast.error(String(e)); })
                }
              />
              <Button
                size="icon"
                variant="ghost"
                aria-label="Unassign voice shortcut"
                onClick={() =>
                  void api
                    .setShortcut("voice", null)
                    .then(() => { toast.success("Voice shortcut unassigned"); })
                    .catch((e) => { toast.error(String(e)); })
                }
              >
                <X className="size-4" />
              </Button>
            </div>
          ) : (
            <ShortcutInput
              value={null}
              placeholder="Unassigned — click to set"
              onSave={(accel) =>
                api
                  .setShortcut("voice", accel)
                  .then(() => { toast.success("Voice shortcut updated"); })
                  .catch((e) => { toast.error(String(e)); })
              }
            />
          )}
        </Row>
        <Row
          label="Gaming mode"
        >
          <Switch
            checked={settings.gamingDetectionEnabled}
            onCheckedChange={(v) => void setSettings({ gamingDetectionEnabled: v })}
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
              onClick={() => void api.openDataFolder().catch((e) => { toast.error(String(e)); })}
            >
              <FolderOpen className="size-4" /> Open folder
            </Button>
          </div>
          <Separator className="my-3" />
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium">Export backup</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Export or import a portable ZIP with every workspace, item, and audio file.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
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
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg px-1 py-2.5">
      <div className="min-w-0">
        <Label className="text-[13px]">{label}</Label>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function ShortcutInput({
  value,
  onSave,
  placeholder,
}: {
  value: string | null;
  onSave: (accel: string) => Promise<void>;
  placeholder?: string;
}) {
  const [capturing, setCapturing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setCapturing(false);
        return;
      }
      if (e.key === "Enter") {
        setCapturing(false);
        return;
      }
      const accel = acceleratorFromEvent(e);
      if (!accel) return;
      setCapturing(false);
      void onSave(accel).catch(() => {});
    },
    [onSave]
  );

  return (
    <Input
      ref={inputRef}
      readOnly
      value={capturing ? "Press keys…" : shortcutLabel(value)}
      placeholder={placeholder}
      aria-label="Shortcut"
      className={cn("w-44 cursor-pointer text-center font-mono text-xs", capturing && "ring-2 ring-ring")}
      onKeyDown={onKeyDown}
      onFocus={() => setCapturing(true)}
      onBlur={() => setCapturing(false)}
      onClick={() => inputRef.current?.focus()}
    />
  );
}

/** Settings rendered as a popup dialog (opened from the "…" menu). */
export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[75vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <SettingsView />
      </DialogContent>
    </Dialog>
  );
}
