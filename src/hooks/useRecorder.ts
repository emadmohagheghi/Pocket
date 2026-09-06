import { useCallback, useEffect, useRef, useState } from "react";
import { recordingExtension } from "@/lib/api";

interface RecorderState {
  recording: boolean;
  elapsedMs: number;
  error: string | null;
}

/**
 * Microphone recorder built on MediaRecorder (opus/webm in WebView2).
 * The audio data stays in memory until stop() hands it to the caller.
 */
export function useRecorder() {
  const [state, setState] = useState<RecorderState>({
    recording: false,
    elapsedMs: 0,
    error: null,
  });
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  /** True from start() until the mic is live — blur-hide waits for this. */
  const startingRef = useRef(false);
  const stopResolverRef = useRef<((value: { blob: Blob; durationMs: number } | null) => void) | null>(null);

  const isBusy = useCallback(() => startingRef.current || recorderRef.current !== null, []);

  const cleanup = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    startingRef.current = false;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    if (recorderRef.current || startingRef.current) return;
    startingRef.current = true;
    setState({ recording: false, elapsedMs: 0, error: null });
    let stream: MediaStream;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new DOMException("mediaDevices unavailable (insecure context?)", "NotSupportedError");
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      void import("@/lib/api").then(({ api }) => api.log("getUserMedia: microphone acquired"));
    } catch (e) {
      void import("@/lib/api").then(({ api }) => api.log(`getUserMedia FAILED: ${e}`));
      startingRef.current = false;
      const denied =
        e instanceof DOMException &&
        (e.name === "NotAllowedError" || e.name === "SecurityError");
      const unsupported = e instanceof DOMException && e.name === "NotSupportedError";
      setState({
        recording: false,
        elapsedMs: 0,
        error: unsupported
          ? "Microphone capture is unavailable in this webview context."
          : denied
            ? "Microphone access was denied. Enable it in Windows privacy settings for this app."
            : "No microphone is available.",
      });
      return;
    }
    streamRef.current = stream;
    chunksRef.current = [];
    const mime = recordingExtension();
    const mr = new MediaRecorder(stream, { mimeType: mime });
    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    mr.onstop = () => {
      const durationMs = Date.now() - startedAtRef.current;
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      cleanup();
      setState({ recording: false, elapsedMs: 0, error: null });
      stopResolverRef.current?.({ blob, durationMs });
      stopResolverRef.current = null;
    };
    recorderRef.current = mr;
    startedAtRef.current = Date.now();
    mr.start(250);
    timerRef.current = window.setInterval(() => {
      setState((s) => ({ ...s, recording: true, elapsedMs: Date.now() - startedAtRef.current }));
    }, 100);
    setState((s) => ({ ...s, recording: true }));
  }, [cleanup]);

  /** Stops and resolves with the recording, or null when idle. */
  const stop = useCallback((): Promise<{ blob: Blob; durationMs: number } | null> => {
    const mr = recorderRef.current;
    if (!mr || mr.state === "inactive") return Promise.resolve(null);
    return new Promise((resolve) => {
      stopResolverRef.current = resolve;
      mr.stop();
    });
  }, []);

  /** Stops and discards the recording. */
  const cancel = useCallback(() => {
    const mr = recorderRef.current;
    stopResolverRef.current = null;
    if (mr && mr.state !== "inactive") {
      mr.onstop = () => {
        cleanup();
        setState({ recording: false, elapsedMs: 0, error: null });
      };
      mr.stop();
    } else {
      cleanup();
      setState({ recording: false, elapsedMs: 0, error: null });
    }
  }, [cleanup]);

  return { ...state, start, stop, cancel, isBusy };
}
