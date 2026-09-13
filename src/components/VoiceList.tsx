import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Trash2 } from "lucide-react";

import { usePocket } from "@/store";
import { voiceUrl } from "@/lib/api";
import { cn, formatDuration } from "@/lib/utils";
import { playPocketSound } from "@/lib/sound";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { Recording } from "@/types";

export function VoiceRow({
  recording,
  focused,
}: {
  recording: Recording;
  focused?: boolean;
}) {
  // Field selectors: rows must not re-render on unrelated store traffic such
  // as other rows' edits or the capture bar's state. Progress selectors
  // return a stable sentinel for rows that aren't currently playing, so only
  // the active row re-renders during playback.
  const deleteRecording = usePocket((s) => s.deleteRecording);
  const isCurrent = usePocket((s) => s.player?.recordingId === recording.id);
  const playing = usePocket((s) =>
    s.player?.recordingId === recording.id ? s.playerPlaying : false
  );
  const elapsedSec = usePocket((s) =>
    s.player?.recordingId === recording.id ? s.playerTime : -1
  );
  const playRecording = usePocket((s) => s.playRecording);
  const togglePlayer = usePocket((s) => s.togglePlayer);
  const stopPlayer = usePocket((s) => s.stopPlayer);
  const requestPlayerSeek = usePocket((s) => s.requestPlayerSeek);
  const rowRef = useRef<HTMLLIElement>(null);
  const activeWorkspaceId = usePocket((s) => s.settings?.activeWorkspaceId);
  // Real decoded audio peaks, lazily loaded when the row first scrolls into
  // view; deterministic placeholder bars until then.
  const { peaks, waveNode, setWaveNode } = useVoicePeaks(
    recording.id,
    activeWorkspaceId,
    recording.file
  );

  useEffect(() => {
    if (focused) {
      rowRef.current?.scrollIntoView({ block: "center" });
      usePocket.getState().setFocusItem(null);
    }
  }, [focused]);

  const toggle = () => {
    if (isCurrent) {
      togglePlayer();
    } else {
      playRecording(recording);
    }
  };

  const onKeyDownRow = (event: React.KeyboardEvent) => {
    if ((event.target as HTMLElement).closest("button, input")) return;
    if (event.key === "Enter") {
      event.preventDefault();
      toggle();
    } else if (event.key === "Escape") {
      event.preventDefault();
      rowRef.current?.blur();
    }
  };

  // Telegram-style seek: press (or drag) anywhere on the waveform. On a
  // row that isn't loaded yet, start playback first, then jump to position.
  const seekWave = (clientX: number) => {
    const el = waveNode;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    if (!isCurrent) {
      playRecording(recording);
      usePocket.getState().setPlayerScrubbing(true);
    }
    requestPlayerSeek(fraction * (recording.durationMs / 1000));
  };

  const totalMs = recording.durationMs;
  const shownMs = elapsedSec >= 0 ? elapsedSec * 1000 : totalMs;
  const progress = totalMs > 0 ? Math.min(1, Math.max(0, shownMs / totalMs)) : 0;

  const contextMenu = (
    <ContextMenuContent>
      <ContextMenuItem
        variant="destructive"
        onSelect={() => {
          if (isCurrent) stopPlayer();
          playPocketSound("destructive");
          void deleteRecording(recording.id);
        }}
      >
        <Trash2 /> Delete
      </ContextMenuItem>
    </ContextMenuContent>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <li
          ref={rowRef}
          tabIndex={0}
          onKeyDown={onKeyDownRow}
          className="group flex items-start gap-3 rounded-2xl border border-border/60 bg-card px-3 py-2.5 transition-colors hover:border-border data-[state=open]:border-blue-500"
        >
          <Button
            size="icon"
            variant={isCurrent ? "default" : "secondary"}
            className="size-9 shrink-0 rounded-full"
            aria-label={playing ? "Pause" : "Play"}
            onClick={toggle}
          >
            {playing ? <Pause /> : <Play className="translate-x-px" />}
          </Button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <VoiceWaveform
                seed={recording.id}
                peaks={peaks}
                progress={progress}
                active={isCurrent}
                playing={playing}
                onSeek={seekWave}
                setNode={setWaveNode}
              />
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {formatDuration(isCurrent && elapsedSec >= 0 ? shownMs : totalMs)}
              </span>
            </div>
          </div>
        </li>
      </ContextMenuTrigger>
      {contextMenu}
    </ContextMenu>
  );
}

/**
 * Invisible audio engine: owns the <audio> element that drives the shared
 * player store. All visible controls live in the voice rows themselves
 * (play button + waveform scrub), so there is no separate player bar.
 * Progress is reported via requestAnimationFrame while playing so the
 * waveform fill moves smoothly instead of in timeupdate-sized steps.
 */
export function VoicePlayerEngine() {
  const player = usePocket((s) => s.player);
  const playerPlaying = usePocket((s) => s.playerPlaying);
  const playerDuration = usePocket((s) => s.playerDuration);
  const playerSeekRequest = usePocket((s) => s.playerSeekRequest);
  const reportPlayerProgress = usePocket((s) => s.reportPlayerProgress);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const src = player ? voiceUrl(player.wsId, player.file) : "";

  const dur = Number.isFinite(playerDuration) ? playerDuration : 0;

  /** Reports progress without ever letting an unloaded (NaN) live duration
      clobber the known length — that NaN was the "0:00 total" bug. */
  const reportLive = (el: HTMLAudioElement, playing: boolean) => {
    const d = el.duration;
    reportPlayerProgress(
      el.currentTime,
      Number.isFinite(d) && d > 0 ? d : dur,
      playing
    );
  };

  /** Applies a pending seek request; safe to call before metadata — the
      value is clamped to the live duration when it arrives. */
  const applySeek = (el: HTMLAudioElement, seconds: number) => {
    const d = el.duration;
    el.currentTime = Math.max(
      0,
      Math.min(seconds, Number.isFinite(d) ? d : seconds)
    );
    usePocket.setState({ playerSeekRequest: null });
  };

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !player) return;
    if (playerPlaying) {
      void el
        .play()
        .catch(() =>
          reportPlayerProgress(el.currentTime, el.duration || 0, false)
        );
    } else {
      el.pause();
    }
  }, [player, playerPlaying, src, reportPlayerProgress]);

  // Smooth progress while playing.
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !player || !playerPlaying) return;
    let raf = 0;
    const tick = () => {
      reportLive(el, true);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, playerPlaying, dur, reportPlayerProgress]);

  // Consume seek requests from waveform clicks and drags.
  useEffect(() => {
    const el = audioRef.current;
    if (el && playerSeekRequest != null && Number.isFinite(playerSeekRequest)) {
      applySeek(el, playerSeekRequest);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerSeekRequest]);

  if (!player) return null;

  return (
    <audio
      ref={audioRef}
      src={src}
      preload="auto"
      onLoadedMetadata={(e) => {
        // A seek may have been requested before the audio was ready (e.g.
        // scrubbing a row that had not been played yet).
        const pending = usePocket.getState().playerSeekRequest;
        if (pending != null && Number.isFinite(pending)) {
          applySeek(e.currentTarget, pending);
        } else {
          reportLive(e.currentTarget, !e.currentTarget.paused);
        }
      }}
      onPlay={(e) => reportLive(e.currentTarget, true)}
      onPause={(e) => reportLive(e.currentTarget, false)}
      onEnded={() => reportPlayerProgress(dur, dur, false)}
    />
  );
}

/**
 * Telegram-style waveform: real decoded audio peaks when available (lazily
 * decoded once per recording, cached module-wide), deterministic placeholder
 * bars until then. Bars stretch to fill the row width regardless of the
 * recording's duration; the played fraction is filled in the primary color.
 */
function VoiceWaveform({
  seed,
  peaks,
  progress,
  active,
  playing,
  onSeek,
  setNode,
}: {
  seed: string;
  peaks: number[] | null;
  progress: number;
  active: boolean;
  playing: boolean;
  onSeek: (clientX: number) => void;
  setNode: (node: HTMLDivElement | null) => void;
}) {
  const [node, setLocalNode] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const draggingRef = useRef(false);
  const pendingXRef = useRef<number | null>(null);
  const scrubRafRef = useRef(0);

  // Measure the row so the bar density adapts: fixed ~3px bars with 2px
  // gaps mean short and long recordings fill edge to edge identically.
  useEffect(() => {
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    observer.observe(node);
    setWidth(node.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, [node, setNode]);

  const source = useMemo(() => peaks ?? seededHeights(seed), [peaks, seed]);
  const count = Math.max(16, Math.min(140, Math.floor((width || 260) / 5)));
  const heights = useMemo(() => {
    if (source.length === count) return source;
    // Linear resample of the source peaks to the measured bar count.
    return Array.from({ length: count }, (_, i) => {
      const pos = (i * (source.length - 1)) / (count - 1);
      const lo = Math.floor(pos);
      const hi = Math.ceil(pos);
      return source[lo] + (source[hi] - source[lo]) * (pos - lo);
    });
  }, [source, count]);
  const filled = Math.round(progress * count);

  return (
    <div
      ref={(el) => {
        setLocalNode(el);
        setNode(el);
      }}
      role={active ? "slider" : undefined}
      aria-label={active ? "Seek" : undefined}
      aria-valuemin={active ? 0 : undefined}
      aria-valuemax={active ? 100 : undefined}
      aria-valuenow={active ? Math.round(progress * 100) : undefined}
      onPointerDown={
        active
          ? (e) => {
              // Capture the pointer so drags that leave the bar keep scrubbing.
              e.currentTarget.setPointerCapture(e.pointerId);
              draggingRef.current = true;
              usePocket.getState().setPlayerScrubbing(true);
              onSeek(e.clientX);
            }
          : undefined
      }
      onPointerMove={
        active
          ? (e) => {
              if (!draggingRef.current) return;
              // Throttle to one seek per frame — rapid-fire el.currentTime
              // writes stutter the audio.
              pendingXRef.current = e.clientX;
              if (!scrubRafRef.current) {
                scrubRafRef.current = requestAnimationFrame(() => {
                  scrubRafRef.current = 0;
                  if (pendingXRef.current != null) {
                    onSeek(pendingXRef.current);
                    pendingXRef.current = null;
                  }
                });
              }
            }
          : undefined
      }
      onPointerUp={() => {
        draggingRef.current = false;
        usePocket.getState().setPlayerScrubbing(false);
      }}
      onPointerCancel={() => {
        draggingRef.current = false;
        usePocket.getState().setPlayerScrubbing(false);
      }}
      className={
        "flex h-7 min-w-0 flex-1 items-center gap-[2px] touch-none" +
        (active ? " cursor-pointer" : "")
      }
    >
      {heights.map((height, i) => (
        <span
          key={i}
          className={cn(
            "min-w-[2px] flex-1 rounded-full transition-colors duration-150",
            i < filled && playing ? "bg-primary" : "bg-primary/30"
          )}
          style={{ height: `${Math.round(Math.max(0.12, height) * 100)}%` }}
        />
      ))}
    </div>
  );
}

// (WAVE_BARS defined above)


const WAVE_BARS = 36;

/** Deterministic pseudo-random bars seeded by the recording id (fallback
    until the real peaks are decoded). */
function seededHeights(seed: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let state = h >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: WAVE_BARS }, (_, i) => {
    const envelope = Math.sin((Math.PI * (i + 0.5)) / WAVE_BARS);
    return 0.25 + next() * 0.75 * (0.35 + 0.65 * envelope);
  });
}

/** Per-recording peak cache shared across renders. */
const peaksCache = new Map<string, number[]>();

/** Decodes the recording's audio once it first scrolls into view and
    extracts WAVE_BARS amplitude peaks. Falls back silently to the seeded
    placeholder if decoding fails. */
function useVoicePeaks(id: string, wsId: string | undefined, file: string) {
  const [peaks, setPeaks] = useState<number[] | null>(
    () => peaksCache.get(id) ?? null
  );
  const [waveNode, setWaveNode] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!waveNode || peaks) return;
    let visible = false;
    let observer: IntersectionObserver | undefined;
    const loadIfVisible = () => {
      if (!visible || peaks || !wsId) return;
      observer?.disconnect();
      let cancelled = false;
      void (async () => {
        try {
          const res = await fetch(voiceUrl(wsId, file));
          const buffer = await res.arrayBuffer();
          const ctx = new AudioContext();
          const audio = await ctx.decodeAudioData(buffer);
          const data = audio.getChannelData(0);
          const block = Math.max(1, Math.floor(data.length / WAVE_BARS));
          const raw: number[] = [];
          let max = 0;
          for (let i = 0; i < WAVE_BARS; i++) {
            let peak = 0;
            for (let j = i * block; j < (i + 1) * block && j < data.length; j += 16) {
              const v = Math.abs(data[j]);
              if (v > peak) peak = v;
            }
            raw.push(peak);
            if (peak > max) max = peak;
          }
          void ctx.close();
          // Gamma compression lifts quiet passages so the bar never
          // collapses to a dot; the 0.15 floor fills the remaining gaps.
          const normalized = raw.map((v) =>
            max > 0 ? 0.15 + 0.85 * Math.pow(v / max, 0.55) : 0
          );
          peaksCache.set(id, normalized);
          if (!cancelled) setPeaks(normalized);
        } catch {
          // Keep the seeded placeholder bars.
        }
      })();
    };
    observer = new IntersectionObserver(
      (entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
        if (visible) loadIfVisible();
      },
      { rootMargin: "200px" }
    );
    observer.observe(waveNode);
    visible = waveNode.checkVisibility() ?? false;
    loadIfVisible();
    return () => observer?.disconnect();
  }, [waveNode, peaks, wsId, file, id]);

  return { peaks, waveNode, setWaveNode };
}
