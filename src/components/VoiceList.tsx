import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Pause, Pencil, Play, RotateCcw, RotateCw, Square, Trash2 } from "lucide-react";

import { usePocket } from "@/store";
import { voiceUrl } from "@/lib/api";
import { cn, formatDuration } from "@/lib/utils";
import { playPocketSound } from "@/lib/sound";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
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
  // the active row re-renders on timeupdate.
  const deleteRecording = usePocket((s) => s.deleteRecording);
  const renameRecording = usePocket((s) => s.renameRecording);
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
  const editRequest = usePocket((s) => s.editRequest);
  const clearEditRequest = usePocket((s) => s.clearEditRequest);
  const [localRenaming, setLocalRenaming] = useState(false);
  const [name, setName] = useState(recording.name);
  const rowRef = useRef<HTMLLIElement>(null);
  const waveRef = useRef<HTMLDivElement>(null);

  // An outstanding store edit request (from search) drives renaming by
  // derivation — the row is renaming while its request is open.
  const editNonce =
    editRequest?.kind === "voice" && editRequest.id === recording.id
      ? editRequest.nonce
      : null;
  const renaming = localRenaming || editNonce !== null;

  useEffect(() => setName(recording.name), [recording.name]);

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

  const submitRename = async () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== recording.name) {
      await renameRecording(recording.id, trimmed);
    }
    setLocalRenaming(false);
    clearEditRequest();
  };

  // Telegram-style seek: click anywhere on the waveform.
  const seekWave = (clientX: number) => {
    const el = waveRef.current;
    if (!el || !isCurrent) return;
    const rect = el.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    requestPlayerSeek(fraction * (recording.durationMs / 1000));
  };

  const totalMs = recording.durationMs;
  const shownMs = elapsedSec >= 0 ? elapsedSec * 1000 : totalMs;
  const progress = totalMs > 0 ? Math.min(1, Math.max(0, shownMs / totalMs)) : 0;

  const contextMenu = (
    <ContextMenuContent>
      <ContextMenuItem onSelect={() => setLocalRenaming(true)}>
        <Pencil /> Rename
      </ContextMenuItem>
      <ContextMenuSeparator />
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
          data-tauri-drag-region="deep"
          onKeyDown={onKeyDownRow}
          className="group flex items-start gap-3 rounded-2xl border border-border/60 bg-card px-3 py-2.5 transition-colors hover:border-border"
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
            {renaming ? (
              <div className="flex items-center gap-1">
                <Input
                  autoFocus
                  value={name}
                  className="h-7"
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submitRename();
                    if (e.key === "Escape") {
                      setLocalRenaming(false);
                      clearEditRequest();
                    }
                  }}
                  onBlur={() => void submitRename()}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label="Confirm rename"
                  onClick={() => void submitRename()}
                >
                  <Check className="size-3.5" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <VoiceWaveform
                  seed={recording.id}
                  progress={progress}
                  active={isCurrent}
                  ref={waveRef}
                  onSeek={seekWave}
                />
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {formatDuration(isCurrent && elapsedSec >= 0 ? shownMs : totalMs)}
                </span>
              </div>
            )}
          </div>
        </li>
      </ContextMenuTrigger>
      {contextMenu}
    </ContextMenu>
  );
}

/**
 * Persistent mini-player pinned at the bottom of the card while a recording
 * is playing or paused. Owns the single shared audio element; rows only
 * dispatch play/pause/seek through the store.
 */
export function PlayerBar() {
  const player = usePocket((s) => s.player);
  const playerPlaying = usePocket((s) => s.playerPlaying);
  const playerTime = usePocket((s) => s.playerTime);
  const playerDuration = usePocket((s) => s.playerDuration);
  const playerSeekRequest = usePocket((s) => s.playerSeekRequest);
  const togglePlayer = usePocket((s) => s.togglePlayer);
  const stopPlayer = usePocket((s) => s.stopPlayer);
  const requestPlayerSeek = usePocket((s) => s.requestPlayerSeek);
  const skipPlayer = usePocket((s) => s.skipPlayer);
  const reportPlayerProgress = usePocket((s) => s.reportPlayerProgress);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const src = player ? voiceUrl(player.wsId, player.file) : "";

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

  useEffect(() => {
    const el = audioRef.current;
    if (el && playerSeekRequest != null && Number.isFinite(playerSeekRequest)) {
      const dur = el.duration;
      el.currentTime = Math.max(
        0,
        Math.min(playerSeekRequest, Number.isFinite(dur) ? dur : playerSeekRequest)
      );
      usePocket.setState({ playerSeekRequest: null });
    }
  }, [playerSeekRequest]);

  if (!player) return null;

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

  return (
    <div className="border-t border-border/60 bg-card/60 px-4 pb-4 pt-3">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onTimeUpdate={(e) => reportLive(e.currentTarget, !e.currentTarget.paused)}
        onLoadedMetadata={(e) => reportLive(e.currentTarget, !e.currentTarget.paused)}
        onPlay={(e) => reportLive(e.currentTarget, true)}
        onPause={(e) => reportLive(e.currentTarget, false)}
        onEnded={() => reportPlayerProgress(dur, dur, false)}
      />
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs font-medium">{player.name}</p>
        <p className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {formatDuration(playerTime * 1000)} / {formatDuration(dur * 1000)}
        </p>
      </div>
      <div className="mt-2 flex items-center gap-1">
        <BarButton label="Back 5 seconds" onClick={() => skipPlayer(-5)}>
          <RotateCcw className="size-4" />
        </BarButton>
        <Button
          size="icon"
          className="size-9 shrink-0 rounded-full"
          aria-label={playerPlaying ? "Pause" : "Play"}
          onClick={() => togglePlayer()}
        >
          {playerPlaying ? (
            <Pause className="size-4" />
          ) : (
            <Play className="size-4" />
          )}
        </Button>
        <BarButton label="Forward 5 seconds" onClick={() => skipPlayer(5)}>
          <RotateCw className="size-4" />
        </BarButton>
        <input
          type="range"
          min={0}
          max={Math.max(dur, 0.1)}
          step={0.1}
          value={Math.min(playerTime, dur)}
          onChange={(e) => requestPlayerSeek(Number(e.target.value))}
          aria-label="Seek"
          className="mx-1 h-1 flex-1 cursor-pointer accent-primary"
        />
        <BarButton label="Stop and close player" onClick={() => stopPlayer()}>
          <Square className="size-4 fill-current" />
        </BarButton>
      </div>
    </div>
  );
}

function BarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      size="icon"
      variant="ghost"
      aria-label={label}
      onClick={onClick}
      className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
    >
      {children}
    </Button>
  );
}

const WAVE_BARS = 36;

/**
 * Telegram-style waveform: deterministic pseudo-random bars seeded by the
 * recording id (stable across renders), with the played fraction filled in
 * the primary color. Click anywhere to seek while the recording is active.
 */
function VoiceWaveform({
  seed,
  progress,
  active,
  onSeek,
  ref,
}: {
  seed: string;
  progress: number;
  active: boolean;
  onSeek: (clientX: number) => void;
  ref: React.Ref<HTMLDivElement>;
}) {
  const heights = useMemo(() => {
    // Mulberry32 over a simple string hash — tiny, deterministic, stable.
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
      // Mid-heavy distribution with a gentle attack/decay envelope so the
      // shape reads as audio rather than noise.
      const envelope = Math.sin((Math.PI * (i + 0.5)) / WAVE_BARS);
      return 0.25 + next() * 0.75 * (0.35 + 0.65 * envelope);
    });
  }, [seed]);

  const filled = Math.round(progress * WAVE_BARS);

  return (
    <div
      ref={ref}
      role={active ? "slider" : undefined}
      aria-label={active ? "Seek" : undefined}
      aria-valuemin={active ? 0 : undefined}
      aria-valuemax={active ? 100 : undefined}
      aria-valuenow={active ? Math.round(progress * 100) : undefined}
      onClick={active ? (e) => onSeek(e.clientX) : undefined}
      className={
        "flex h-7 min-w-0 flex-1 items-center gap-[2px]" +
        (active ? " cursor-pointer" : "")
      }
    >
      {heights.map((height, i) => (
        <span
          key={i}
          className={cn(
            "w-[3px] shrink-0 rounded-full transition-colors duration-150",
            i < filled ? "bg-primary" : "bg-muted-foreground/35"
          )}
          style={{ height: `${Math.round(height * 100)}%` }}
        />
      ))}
    </div>
  );
}
