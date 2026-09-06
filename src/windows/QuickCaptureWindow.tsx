import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalSize } from "@tauri-apps/api/dpi";
import {
  AudioLines,
  Check,
  Link2,
  Square,
  SquareCheck,
  SquarePen,
  StickyNote,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { useQc, useQcEvents } from "@/qcStore";
import { useRecorder } from "@/hooks/useRecorder";
import { cn, formatDuration, looksLikeUrl } from "@/lib/utils";
import type { ItemType } from "@/types";

const TYPES: { id: ItemType; label: string; icon: typeof SquarePen; hotkey: string }[] = [
  { id: "text", label: "Text", icon: SquarePen, hotkey: "1" },
  { id: "note", label: "Note", icon: StickyNote, hotkey: "2" },
  { id: "prompt", label: "Prompt", icon: Terminal, hotkey: "3" },
  { id: "task", label: "Task", icon: SquareCheck, hotkey: "4" },
  { id: "link", label: "Link", icon: Link2, hotkey: "5" },
];

export default function QuickCaptureWindow() {
  const { settings, workspaces } = useQc();
  const [mode, setMode] = useState<"text" | "voice">("text");
  const [content, setContent] = useState("");
  const [type, setType] = useState<ItemType>("text");
  const [savedFlash, setSavedFlash] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recorder = useRecorder();

  const activeWs = workspaces.find((w) => w.id === settings?.activeWorkspaceId);
  const win = getCurrentWebviewWindow();

  const hideWindow = useCallback(async () => {
    await win.hide();
    setMode("text");
    setContent("");
    setType("text");
    setSavedFlash(false);
  }, [win]);

  const flashThenHide = useCallback(() => {
    setSavedFlash(true);
    window.setTimeout(() => void hideWindow(), 450);
  }, [hideWindow]);

  // Global capture-open event → configure and focus.
  useQcEvents((openMode) => {
    setMode(openMode);
    setContent("");
    setType("text");
    setSavedFlash(false);
    if (openMode === "voice") {
      void recorder.start();
    } else {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  });

  // Hide when losing focus (unless recording or showing a flash).
  useEffect(() => {
    const unlistenP = win.onFocusChanged(({ payload: focused }) => {
      if (!focused && !recorder.isBusy() && !savedFlash) {
        void hideWindow();
      }
    });
    return () => {
      void unlistenP.then((f) => f());
    };
  }, [win, recorder.isBusy, recorder.recording, savedFlash, hideWindow]);

  // Resize for voice mode.
  useEffect(() => {
    const h = mode === "voice" ? 190 : 148;
    void win.setSize(new LogicalSize(620, h)).catch(() => {});
  }, [mode, win]);

  const effectiveType: ItemType =
    type === "text" && looksLikeUrl(content) ? "link" : type;

  const save = async () => {
    const text = content.trim();
    if (!text) return;
    try {
      await api.log(`capture save: type=${effectiveType} len=${text.length} ws=${activeWs?.id}`);
      await api.createItem(activeWs?.id ?? "", { itemType: effectiveType, content: text });
      await api.log("capture save: create_item resolved");
      setContent("");
      flashThenHide();
    } catch (e) {
      void api.log(`capture save FAILED: ${e}`);
      toast.error(String(e));
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      void hideWindow();
    } else if (e.altKey) {
      const t = TYPES.find((x) => x.hotkey === e.key);
      if (t) {
        e.preventDefault();
        setType(t.id);
      }
    }
  };

  const stopAndSave = async () => {
    const result = await recorder.stop();
    if (!result) {
      void api.log("voice stopAndSave: recorder returned null (was not recording)");
      return;
    }
    try {
      const buffer = await result.blob.arrayBuffer();
      void api.log(
        `voice stopAndSave: blob=${result.blob.size}B duration=${result.durationMs}ms ws=${activeWs?.id}`
      );
      void api.log(
        `buffer check: ctor=${buffer?.constructor?.name} isAB=${buffer instanceof ArrayBuffer} byteLength=${buffer?.byteLength}`
      );
      const saved = await api.saveRecording(
        activeWs?.id ?? "",
        `Voice note ${new Date().toLocaleString()}`,
        result.durationMs,
        buffer
      );
      await api.log(`voice stopAndSave: saved id=${saved.id} file=${saved.file}`);
      flashThenHide();
    } catch (e) {
      void api.log(`voice stopAndSave FAILED: ${e}`);
      toast.error(`Could not save recording: ${e}`);
    }
  };

  if (mode === "voice") {
    return (
      <div
        className="flex h-screen flex-col justify-center gap-3 bg-background px-4 py-3"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            recorder.cancel();
            void hideWindow();
          }
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[13px] font-medium">
            <span className={cn("size-2 rounded-full", recorder.recording ? "animate-pulse bg-red-500" : "bg-muted-foreground/40")} />
            {recorder.recording ? "Recording…" : "Voice note"}
            <span className="text-muted-foreground">→ {activeWs?.name ?? "…"}</span>
          </div>
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            {formatDuration(recorder.elapsedMs)}
          </span>
        </div>

        {recorder.error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{recorder.error}</p>
        )}

        <div className="flex items-center gap-2">
          {recorder.recording ? (
            <>
              <button
                onClick={() => void stopAndSave()}
                className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-red-500 text-[13px] font-medium text-white transition-colors hover:bg-red-600 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <Square className="size-3.5 fill-current" /> Stop & save
              </button>
              <button
                onClick={() => void hideWindow()}
                className="h-9 rounded-lg border px-3 text-[13px] text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => void recorder.start()}
                className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-primary text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <AudioLines className="size-4" /> Start recording
              </button>
              <button
                onClick={() => setMode("text")}
                className="h-9 rounded-lg border px-3 text-[13px] text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
              >
                Text mode
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background" onKeyDown={onKeyDown}>
      <div className="flex items-center gap-1 border-b px-3 pt-2.5">
        {TYPES.map(({ id, label, icon: Icon, hotkey }) => (
          <button
            key={id}
            onClick={() => setType(id)}
            aria-pressed={effectiveType === id}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
              "text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
              effectiveType === id && "bg-accent font-medium text-accent-foreground"
            )}
            title={`${label} (Alt+${hotkey})`}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
        <div className="flex-1" />
        <span className="truncate pr-1 text-[11px] text-muted-foreground">
          → {activeWs?.name ?? "…"}
        </span>
        <button
          onClick={() => {
            setMode("voice");
            void recorder.start().then(() => {});
          }}
          aria-label="Record voice note"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          title="Record voice note"
        >
          <AudioLines className="size-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-start px-3 py-2.5">
        {savedFlash ? (
          <div className="flex w-full items-center justify-center gap-2 text-sm text-emerald-600">
            <Check className="size-4" /> Saved to {activeWs?.name}
          </div>
        ) : (
          <textarea
            ref={inputRef}
            autoFocus
            value={content}
            rows={2}
            placeholder={`Capture a ${effectiveType}…  Enter to save · Esc to close`}
            className="h-full w-full resize-none bg-transparent text-[14px] leading-relaxed outline-none placeholder:text-muted-foreground/60"
            onChange={(e) => setContent(e.target.value)}
          />
        )}
      </div>

      <div className="flex items-center justify-between border-t px-3 py-1.5 text-[10px] text-muted-foreground">
        <span>Enter save · Shift+Enter newline · Alt+1-5 type · Esc close</span>
        <span className="flex items-center gap-1">
          {effectiveType === "task" && <SquareCheck className="size-3" />}
          {effectiveType === "task" ? "goes to Tasks" : "saved locally"}
        </span>
      </div>
    </div>
  );
}
