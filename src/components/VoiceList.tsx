import { useEffect, useRef, useState } from "react";
import { Check, Pause, Pencil, Play, RotateCcw, RotateCw, Square, Trash2 } from "lucide-react";

import { usePocket } from "@/store";
import { voiceUrl } from "@/lib/api";
import { formatBytes, formatDuration, formatRelative } from "@/lib/utils";
import { playPocketSound } from "@/lib/sound";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PinButton } from "@/components/PinButton";
import type { Recording } from "@/types";

export function VoiceRow({
  recording,
  focused,
}: {
  recording: Recording;
  focused?: boolean;
}) {
  // Field selectors: rows must not re-render on unrelated store traffic such
  // as other rows' edits or the capture bar's state.
  const deleteRecording = usePocket((s) => s.deleteRecording);
  const renameRecording = usePocket((s) => s.renameRecording);
  const player = usePocket((s) => s.player);
  const playerPlaying = usePocket((s) => s.playerPlaying);
  const playRecording = usePocket((s) => s.playRecording);
  const togglePlayer = usePocket((s) => s.togglePlayer);
  const stopPlayer = usePocket((s) => s.stopPlayer);
  const setEntryPinned = usePocket((s) => s.setEntryPinned);
  const editRequest = usePocket((s) => s.editRequest);
  const clearEditRequest = usePocket((s) => s.clearEditRequest);
  const [localRenaming, setLocalRenaming] = useState(false);
  const [name, setName] = useState(recording.name);
  const rowRef = useRef<HTMLLIElement>(null);

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

  const isCurrent = player?.recordingId === recording.id;
  const playing = isCurrent && playerPlaying;

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

  const togglePin = () =>
    void setEntryPinned("voice", recording.id, !recording.pinned);
  const hoverActions = (
    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
      <PinButton pinned={recording.pinned} onToggle={togglePin} />
      <Button
        size="icon-sm"
        variant="ghost"
        className="text-muted-foreground hover:text-foreground"
        aria-label="Rename"
        onClick={() => setLocalRenaming(true)}
      >
        <Pencil />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        className="text-muted-foreground hover:text-destructive"
        aria-label="Delete recording"
        onClick={() => {
          if (isCurrent) stopPlayer();
          playPocketSound("destructive");
          void deleteRecording(recording.id);
        }}
      >
        <Trash2 />
      </Button>
    </div>
  );

  return (
    <li
      ref={rowRef}
      tabIndex={0}
      data-tauri-drag-region="deep"
      onKeyDown={onKeyDownRow}
      className="group flex items-start gap-3 px-1 py-3"
    >
      <div className="relative mt-0.5 size-8 shrink-0">
        <Button
          size="icon"
          variant="secondary"
          className="size-8 rounded-full"
          aria-label={playing ? "Pause" : "Play"}
          onClick={toggle}
        >
          {playing ? <Pause /> : <Play />}
        </Button>
      </div>

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
          <p className="truncate text-sm font-normal">{recording.name}</p>
        )}
        <div className="mt-1 flex min-h-6 items-center justify-between gap-2">
          <p className="min-w-0 text-[11px] text-muted-foreground/70">
            {formatDuration(recording.durationMs)} · {formatBytes(recording.sizeBytes)} ·{" "}
            {formatRelative(recording.createdAt)}
          </p>
          {hoverActions}
        </div>
      </div>
    </li>
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
