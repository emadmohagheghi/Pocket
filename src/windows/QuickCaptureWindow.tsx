import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { listen } from "@tauri-apps/api/event";
import { AudioLines, Check, Square } from "lucide-react";

import { api } from "@/lib/api";
import { applyTheme } from "@/lib/theme";
import { useQc, useQcEvents } from "@/qcStore";
import { useRecorder } from "@/hooks/useRecorder";
import { NebulaOrb } from "@/components/NebulaOrb";
import { cn, formatDuration } from "@/lib/utils";
import { playPocketSound } from "@/lib/sound";

export default function QuickCaptureWindow() {
  const { settings, workspaces } = useQc();
  const [savedFlash, setSavedFlash] = useState(false);
  const recorder = useRecorder();
  const heldVoiceActiveRef = useRef(false);
  const heldVoiceReleasedRef = useRef(false);
  const leftVoiceStopRequestedRef = useRef(false);
  const automaticVoiceSaveStartedRef = useRef(false);
  const recorderRecordingRef = useRef(false);
  const stopAndSaveRef = useRef<() => Promise<void>>(async () => {});
  const finishAutomaticVoiceRef = useRef<() => void>(() => {});
  /** The delayed hide after a save; must be cancelled if the panel is
   * reopened within the flash window, or it kills the fresh session. */
  const flashHideTimerRef = useRef<number | null>(null);
  recorderRecordingRef.current = recorder.recording;

  useEffect(() => {
    if (settings) applyTheme(settings.theme);
  }, [settings?.theme]);

  const activeWs = workspaces.find((workspace) => workspace.id === settings?.activeWorkspaceId);
  const win = getCurrentWebviewWindow();

  const hideWindow = useCallback(async () => {
    // Hiding the panel must always release the microphone and discard any
    // unsaved audio, including a permission request still in flight.
    if (flashHideTimerRef.current !== null) {
      window.clearTimeout(flashHideTimerRef.current);
      flashHideTimerRef.current = null;
    }
    recorder.cancel();
    try {
      await win.hide();
    } catch {
      /* already hidden */
    }
    setSavedFlash(false);
    heldVoiceActiveRef.current = false;
    heldVoiceReleasedRef.current = false;
    leftVoiceStopRequestedRef.current = false;
    automaticVoiceSaveStartedRef.current = false;
  }, [win, recorder.cancel]);

  const flashThenHide = useCallback(() => {
    setSavedFlash(true);
    flashHideTimerRef.current = window.setTimeout(() => {
      flashHideTimerRef.current = null;
      void hideWindow();
    }, 450);
  }, [hideWindow]);

  useQcEvents((openMode) => {
    // A stale save-flash timer would hide the panel right after this open.
    if (flashHideTimerRef.current !== null) {
      window.clearTimeout(flashHideTimerRef.current);
      flashHideTimerRef.current = null;
      setSavedFlash(false);
    }
    // A second Left-Shift double-hold while recording stops and saves. Right
    // Shift uses the separate release event below for push-to-record.
    if (openMode === "voice" && recorder.isBusy()) {
      leftVoiceStopRequestedRef.current = true;
      finishAutomaticVoiceRef.current();
      return;
    }

    setSavedFlash(false);
    heldVoiceActiveRef.current = openMode === "voice-hold";
    heldVoiceReleasedRef.current = false;
    leftVoiceStopRequestedRef.current = false;
    automaticVoiceSaveStartedRef.current = false;
    playPocketSound("open");
    void recorder.start();
  });

  // A successful direct text capture never opens this window; Rust asks its
  // already-loaded webview to play the same local confirmation cue.
  useEffect(() => {
    const unlistenPromise = listen<string>("play-sfx", (event) => {
      playPocketSound(event.payload === "text" ? "success" : "open");
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  // Losing focus does not cancel an active recording. An idle panel can close
  // itself normally when the user moves elsewhere.
  useEffect(() => {
    const unlistenPromise = win.onFocusChanged(({ payload: focused }) => {
      if (!focused && !recorder.isBusy() && !savedFlash) {
        void hideWindow();
      }
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [win, recorder.isBusy, recorder.recording, savedFlash, hideWindow]);

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
      playPocketSound("success");
      flashThenHide();
    } catch (error) {
      void api.log(`voice stopAndSave FAILED: ${error}`);
      playPocketSound("error");
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

  // Right Shift can be released while getUserMedia is still resolving. Keep
  // the request and finish as soon as MediaRecorder reports live.
  useEffect(() => {
    const unlistenPromise = listen("voice-hold-release", () => {
      if (!heldVoiceActiveRef.current) return;
      heldVoiceReleasedRef.current = true;
      finishAutomaticVoice();
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [finishAutomaticVoice]);

  useEffect(() => {
    if (recorder.recording) finishAutomaticVoice();
  }, [finishAutomaticVoice, recorder.recording]);

  return (
    <div
      data-tauri-drag-region="deep"
      className="flex h-screen items-center gap-4 overflow-hidden rounded-3xl border border-border/60 bg-background py-3 pl-4 pr-5"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          void hideWindow();
        }
      }}
    >
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-[13px] font-medium">
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                recorder.recording ? "animate-pulse bg-red-500" : "bg-muted-foreground/40"
              )}
            />
            <span className="shrink-0">
              {savedFlash ? "Saved" : recorder.recording ? "Recording…" : "Voice note"}
            </span>
            <span className="truncate text-muted-foreground">→ {activeWs?.name ?? "…"}</span>
          </div>
          <span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
            {formatDuration(recorder.elapsedMs)}
          </span>
        </div>

        {recorder.error ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {recorder.error}
          </p>
        ) : null}

        <div className="flex items-center gap-2">
          {savedFlash ? (
            <div className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500/10 text-[13px] font-medium text-emerald-600">
              <Check className="size-4" /> Saved
            </div>
          ) : recorder.recording ? (
            <>
              <button
                type="button"
                onClick={() => void stopAndSave()}
                className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-red-500 text-[13px] font-medium text-white transition-colors hover:bg-red-600"
              >
                <Square className="size-3.5 fill-current" /> Stop &amp; save
              </button>
              <button
                type="button"
                onClick={() => {
                  playPocketSound("close");
                  void hideWindow();
                }}
                className="h-9 rounded-lg border px-3 text-[13px] text-muted-foreground transition-colors hover:bg-accent"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  playPocketSound("open");
                  void recorder.start();
                }}
                className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-primary text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <AudioLines className="size-4" /> Start recording
              </button>
              <button
                type="button"
                onClick={() => {
                  playPocketSound("close");
                  void hideWindow();
                }}
                className="h-9 rounded-lg border px-3 text-[13px] text-muted-foreground transition-colors hover:bg-accent"
              >
                Cancel
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
