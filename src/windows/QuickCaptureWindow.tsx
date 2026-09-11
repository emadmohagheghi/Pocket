import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { listen } from "@tauri-apps/api/event";
import { LogicalSize } from "@tauri-apps/api/dpi";
import {
  AudioLines,
  Check,
  Square,
  SquarePen,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { applyTheme } from "@/lib/theme";
import { useQc, useQcEvents } from "@/qcStore";
import { useRecorder } from "@/hooks/useRecorder";
import { NebulaOrb } from "@/components/NebulaOrb";
import { cn, formatDuration, looksLikeUrl } from "@/lib/utils";
import textSfxUrl from "@/assets/sounds/capture-text.mp3";
import voiceSfxUrl from "@/assets/sounds/capture-voice.mp3";

// Preloaded so a capture sound plays with no decode latency. The Rust side
// emits "play-sfx" for the double-shift tap (direct save, no window shown);
// the voice sound plays here when a capture-open arrives in voice mode.
const textSfx = new Audio(textSfxUrl);
const voiceSfx = new Audio(voiceSfxUrl);

function playSfx(kind: string) {
  const audio = kind === "voice" ? voiceSfx : textSfx;
  audio.currentTime = 0;
  void audio.play().catch((e) => void api.log(`sfx ${kind} failed: ${e}`));
}

export default function QuickCaptureWindow() {
  const { settings, workspaces } = useQc();
  const [mode, setMode] = useState<"text" | "voice">("text");
  const [content, setContent] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recorder = useRecorder();
  const heldVoiceActiveRef = useRef(false);
  const heldVoiceReleasedRef = useRef(false);
  const leftVoiceStopRequestedRef = useRef(false);
  const automaticVoiceSaveStartedRef = useRef(false);
  const recorderRecordingRef = useRef(false);
  const stopAndSaveRef = useRef<() => Promise<void>>(async () => {});
  const finishAutomaticVoiceRef = useRef<() => void>(() => {});
  recorderRecordingRef.current = recorder.recording;

  // Match the main window's theme; without this the bar renders light while
  // the main widget is dark.
  useEffect(() => {
    if (settings) applyTheme(settings.theme);
  }, [settings?.theme]);

  const activeWs = workspaces.find((w) => w.id === settings?.activeWorkspaceId);
  const win = getCurrentWebviewWindow();

  const hideWindow = useCallback(async () => {
    // Hiding a capture must always release the microphone and discard any
    // unsaved audio, including a getUserMedia request still in flight.
    recorder.cancel();
    // The bar can already be gone (user dismissed it mid-flash); hiding a
    // closed window must never surface as an error.
    try {
      await win.hide();
    } catch {
      /* already closed */
    }
    setMode("text");
    setContent("");
    setSavedFlash(false);
    heldVoiceActiveRef.current = false;
    heldVoiceReleasedRef.current = false;
    leftVoiceStopRequestedRef.current = false;
    automaticVoiceSaveStartedRef.current = false;
  }, [win, recorder.cancel]);

  const flashThenHide = useCallback(() => {
    setSavedFlash(true);
    window.setTimeout(() => void hideWindow(), 450);
  }, [hideWindow]);

  // Global capture-open event → configure and focus.
  useQcEvents((openMode, prefill) => {
    // A second Left-Shift double-hold while voice capture is live keeps the
    // established toggle behavior: stop and save the current recording.
    if (openMode === "voice" && recorder.isBusy()) {
      leftVoiceStopRequestedRef.current = true;
      finishAutomaticVoiceRef.current();
      return;
    }

    const isVoice = openMode !== "text";
    const isHeldVoice = openMode === "voice-hold";
    setMode(isVoice ? "voice" : "text");
    setContent(prefill ?? "");
    setSavedFlash(false);
    heldVoiceActiveRef.current = isHeldVoice;
    heldVoiceReleasedRef.current = false;
    leftVoiceStopRequestedRef.current = false;
    automaticVoiceSaveStartedRef.current = false;
    if (isVoice) {
      playSfx("voice");
      void recorder.start();
    } else {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        if (prefill) inputRef.current?.select();
      });
    }
  });

  // Double-shift tap: Rust saved the selected text without showing this
  // window and asks us to confirm with a sound.
  useEffect(() => {
    const unlistenP = listen<string>("play-sfx", (e) => playSfx(e.payload));
    return () => {
      void unlistenP.then((f) => f());
    };
  }, []);

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

  const save = async () => {
    const text = content.trim();
    if (!text) return;
    try {
      await api.log(`capture save: len=${text.length} ws=${activeWs?.id}`);
      await api.createItem(activeWs?.id ?? "", { itemType: "text", content: text });
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
    } else if (e.altKey && e.key === "1") {
      // Alt+1 — stay in / return to text mode.
      e.preventDefault();
      setMode("text");
    } else if (e.altKey && e.key === "2") {
      // Alt+2 — switch to voice-recording mode.
      e.preventDefault();
      setMode("voice");
      void recorder.start();
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

  stopAndSaveRef.current = stopAndSave;

  const finishAutomaticVoice = useCallback(() => {
    const saveRequested =
      leftVoiceStopRequestedRef.current ||
      (heldVoiceActiveRef.current && heldVoiceReleasedRef.current);
    if (
      !saveRequested ||
      automaticVoiceSaveStartedRef.current ||
      !recorderRecordingRef.current
    ) {
      return;
    }
    automaticVoiceSaveStartedRef.current = true;
    void stopAndSaveRef.current();
  }, []);
  finishAutomaticVoiceRef.current = finishAutomaticVoice;

  // Right Shift release can arrive while getUserMedia is still resolving.
  // Remember it, then finish as soon as MediaRecorder reports live.
  useEffect(() => {
    const unlistenP = listen("voice-hold-release", () => {
      if (!heldVoiceActiveRef.current) return;
      heldVoiceReleasedRef.current = true;
      finishAutomaticVoice();
    });
    return () => {
      void unlistenP.then((f) => f());
    };
  }, [finishAutomaticVoice]);

  useEffect(() => {
    if (recorder.recording) {
      finishAutomaticVoice();
    }
  }, [finishAutomaticVoice, recorder.recording]);

  if (mode === "voice") {
    return (
      <div
        data-tauri-drag-region="deep"
        className="flex h-screen items-center gap-4 overflow-hidden rounded-3xl border border-border/60 bg-background py-3 pl-4 pr-5"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            void hideWindow();
          }
        }}
      >
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-3">
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
                  <Square className="size-3.5 fill-current" /> Stop &amp; save
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

        <NebulaOrb
          size={132}
          color="#ef4444"
          highlightColor="#fff5f5"
          speed={1.5}
          levelRef={recorder.levelRef}
          paused={!recorder.recording}
          aria-hidden
          className={cn("shrink-0 transition-opacity", !recorder.recording && "opacity-60")}
        />
      </div>
    );
  }

  const looksLink = looksLikeUrl(content);

  return (
    <div
      data-tauri-drag-region="deep"
      className="flex h-screen flex-col overflow-hidden rounded-3xl border border-border/60 bg-background"
      onKeyDown={onKeyDown}
    >
      <div className="flex items-center gap-1 border-b px-3 pt-2.5">
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
            "bg-accent font-medium text-accent-foreground"
          )}
          title="Text (Alt+1)"
        >
          <SquarePen className="size-3.5" />
          Text
        </div>
        <button
          onClick={() => {
            setMode("voice");
            void recorder.start();
          }}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
            "text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          )}
          title="Voice (Alt+2)"
        >
          <AudioLines className="size-3.5" />
          Voice
        </button>
        <div className="flex-1" />
        <span className="truncate pr-1 text-[11px] text-muted-foreground">
          → {activeWs?.name ?? "…"}
        </span>
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
            placeholder={`Capture text…  Enter to save · Esc to close`}
            className="h-full w-full resize-none bg-transparent text-[14px] leading-relaxed outline-none placeholder:text-muted-foreground/60"
            onChange={(e) => setContent(e.target.value)}
          />
        )}
      </div>

      <div className="flex items-center justify-between border-t px-3 py-1.5 text-[10px] text-muted-foreground">
        <span>Enter save · Shift+Enter newline · Alt+1 text · Alt+2 voice · Esc close</span>
        <span>{looksLink ? "link — will be clickable" : "saved locally"}</span>
      </div>
    </div>
  );
}
