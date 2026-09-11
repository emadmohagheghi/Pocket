import { useEffect, useState } from "react";
import { open as openFile, save } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
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
import type { StorageInfo } from "@/types";

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
          <Select value={settings.theme} onValueChange={(v) => void setSettings({ theme: v as never })}>
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
        <Row label="Pin interaction" description="Temporary comparison mode">
          <Select
            value={settings.pinControlStyle}
            onValueChange={(value) =>
              void setSettings({ pinControlStyle: value as typeof settings.pinControlStyle })
            }
          >
            <SelectTrigger className="w-40" aria-label="Pin interaction style">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="hover-toolbar">Hover toolbar</SelectItem>
                <SelectItem value="metadata">Beside timestamp</SelectItem>
                <SelectItem value="leading">Leading icon</SelectItem>
                <SelectItem value="bottom-bar">Bottom action bar</SelectItem>
                <SelectItem value="drag">Drag to pin</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
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
              onClick={() => void api.openDataFolder().catch((e) => { toast.error(String(e)); })}
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
      <div className="space-y-1">{children}</div>
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
    <div className="flex items-center justify-between gap-4 rounded-lg px-1 py-2.5">
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
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4">
          <SettingsView />
        </div>
      </DialogContent>
    </Dialog>
  );
}
