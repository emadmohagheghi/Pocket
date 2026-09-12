import { useCallback, useEffect, useRef, useState } from "react";
import { recordingExtension } from "@/lib/api";

interface RecorderState {
  recording: boolean;
  paused: boolean;
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
    paused: false,
    elapsedMs: 0,
    error: null,
  });
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  /** Elapsed recording time, excluding paused stretches. */
  const activeMsRef = useRef(0);
  /** Start of the current unpaused segment (wall clock). */
  const segmentStartRef = useRef(0);
  const pausedRef = useRef(false);
  /** True from start() until the mic is live — blur-hide waits for this. */
  const startingRef = useRef(false);
  /** Invalidates a pending getUserMedia request when capture is cancelled. */
  const startRequestRef = useRef(0);
  const stopResolverRef = useRef<((value: { blob: Blob; durationMs: number } | null) => void) | null>(null);

  // Live input level (0..1, smoothed), read per-frame by consumers like the
  // recorder orb; kept in a ref so the meter never re-renders the window.
  const levelRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const meterRafRef = useRef(0);
  const meterDataRef = useRef<Float32Array | null>(null);

  const isBusy = useCallback(() => startingRef.current || recorderRef.current !== null, []);

  const cleanup = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    cancelAnimationFrame(meterRafRef.current);
    sourceNodeRef.current?.disconnect();
    sourceNodeRef.current = null;
    analyserRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    levelRef.current = 0;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    startingRef.current = false;
    activeMsRef.current = 0;
    segmentStartRef.current = 0;
    pausedRef.current = false;
  }, []);

  const elapsedNow = () =>
    activeMsRef.current + (pausedRef.current ? 0 : Date.now() - segmentStartRef.current);

  useEffect(
    () => () => {
      startRequestRef.current += 1;
      cleanup();
    },
    [cleanup]
  );

  const start = useCallback(async () => {
    if (recorderRef.current || startingRef.current) return;
    const requestId = ++startRequestRef.current;
    startingRef.current = true;
    setState({ recording: false, paused: false, elapsedMs: 0, error: null });
    let stream: MediaStream;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new DOMException("mediaDevices unavailable (insecure context?)", "NotSupportedError");
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      void import("@/lib/api").then(({ api }) => api.log("getUserMedia: microphone acquired"));
    } catch (e) {
      if (requestId !== startRequestRef.current) return;

      void import("@/lib/api").then(({ api }) => api.log(`getUserMedia FAILED: ${e}`));
      startingRef.current = false;
      const denied =
        e instanceof DOMException &&
        (e.name === "NotAllowedError" || e.name === "SecurityError");
      const unsupported = e instanceof DOMException && e.name === "NotSupportedError";
      setState({
        recording: false,
        paused: false,
        elapsedMs: 0,
        error: unsupported
          ? "Microphone capture is unavailable in this webview context."
          : denied
            ? "Microphone access was denied. Enable it in Windows privacy settings for this app."
            : "No microphone is available.",
      });
      return;
    }
    if (requestId !== startRequestRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    streamRef.current = stream;
    chunksRef.current = [];

    // Meter chain: analyser only (never to destination — no monitoring echo).
    try {
      const ctx = new AudioContext();
      void ctx.resume().catch(() => {});
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      audioCtxRef.current = ctx;
      sourceNodeRef.current = source;
      analyserRef.current = analyser;
      const data = new Float32Array(analyser.fftSize);
      meterDataRef.current = data;
      // Two-stage envelope: a fast peak follower, then a mid-speed ease that
      // keeps speech spikes from twitching the orb without hiding the swell.
      // Both stages are exponential (frame-rate independent) and the output
      // curve is ease-out quad — responsive right at onset, gentle at the top.
      let fast = 0;
      let slow = 0;
      let lastNow = 0;
      const follow = (from: number, to: number, perSecond: number, dt: number) =>
        from + (to - from) * (1 - Math.exp(-perSecond * dt));
      const frame = (now: number): void => {
        meterRafRef.current = requestAnimationFrame(frame);
        const dt = lastNow ? Math.min((now - lastNow) / 1000, 0.1) : 1 / 60;
        lastNow = now;
        analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length);
        const instant = Math.min(1, Math.max(0, rms - 0.01) * 8.5);
        fast = follow(fast, instant, instant > fast ? 18 : 4, dt);
        slow = follow(slow, fast, 6, dt);
        levelRef.current = slow * (2 - slow);
      };
      meterRafRef.current = requestAnimationFrame(frame);
    } catch {
      // Metering is decorative; recording must survive an AudioContext failure.
    }

    const mime = recordingExtension();
    const mr = new MediaRecorder(stream, { mimeType: mime });
    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    mr.onstop = () => {
      // Measure before cleanup() zeroes the segment refs.
      const durationMs = elapsedNow();
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      cleanup();
      setState({ recording: false, paused: false, elapsedMs: 0, error: null });
      stopResolverRef.current?.({ blob, durationMs });
      stopResolverRef.current = null;
    };
    recorderRef.current = mr;
    activeMsRef.current = 0;
    segmentStartRef.current = Date.now();
    pausedRef.current = false;
    mr.start(250);
    timerRef.current = window.setInterval(() => {
      setState((s) => ({ ...s, recording: true, elapsedMs: elapsedNow() }));
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
    startRequestRef.current += 1;
    const mr = recorderRef.current;
    stopResolverRef.current = null;
    if (mr && mr.state !== "inactive") {
      mr.onstop = () => {
        cleanup();
        setState({ recording: false, paused: false, elapsedMs: 0, error: null });
      };
      mr.stop();
    } else {
      cleanup();
      setState({ recording: false, paused: false, elapsedMs: 0, error: null });
    }
  }, [cleanup]);

  /** Pauses capture; the elapsed timer freezes until resume(). */
  const pause = useCallback(() => {
    const mr = recorderRef.current;
    if (!mr || mr.state !== "recording" || pausedRef.current) return;
    mr.pause();
    activeMsRef.current += Date.now() - segmentStartRef.current;
    pausedRef.current = true;
    setState((s) => ({ ...s, paused: true }));
  }, []);

  /** Continues a paused take; elapsed time keeps excluding the paused stretch. */
  const resume = useCallback(() => {
    const mr = recorderRef.current;
    if (!mr || mr.state !== "paused" || !pausedRef.current) return;
    mr.resume();
    pausedRef.current = false;
    segmentStartRef.current = Date.now();
    setState((s) => ({ ...s, paused: false }));
  }, []);

  return { ...state, start, stop, cancel, pause, resume, isBusy, levelRef };
}
