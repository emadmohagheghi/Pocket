import { useEffect, useRef, useState } from "react";
import { AudioLines, Check, Pause, Pencil, Play, RotateCcw, RotateCw, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { usePocket } from "@/store";
import { api, voiceUrl } from "@/lib/api";
import { cn, formatBytes, formatDuration, formatRelative } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionLabel } from "@/components/ItemList";
import { PinButton } from "@/components/PinButton";
import type { Recording } from "@/types";

export function VoiceList() {
  const { data } = usePocket();
  const recordings = data?.recordings ?? [];

  if (recordings.length === 0) {
    return (
      <div className="px-1 pb-1 pt-3">
        <SectionLabel>Voice</SectionLabel>
        <p className="px-1 text-[15px] font-semibold text-foreground">No voice notes yet</p>
        <p className="mt-1 max-w-md px-1 text-[13px] leading-relaxed text-muted-foreground">
          Start a recording with the microphone button or from the tray menu.
          Recordings never leave this machine.
        </p>
        <div className="px-1 pt-3">
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            onClick={() =>
              api
                .openVoiceCapture()
                .catch((e) => toast.error(String(e)))
            }
          >
            <AudioLines className="size-3.5" /> Record a voice note
          </Button>
        </div>
      </div>
    );
  }

  const sorted = [...recordings].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="px-1 pt-1" role="list">
      <SectionLabel>Voice notes</SectionLabel>
      <div className="divide-y divide-border/70" role="list">
        {sorted.map((rec) => (
          <VoiceRow key={rec.id} recording={rec} />
        ))}
      </div>
    </div>
  );
}

export function VoiceRow({
  recording,
  focused,
  onEntryPointerDown,
}: {
  recording: Recording;
  focused?: boolean;
  onEntryPointerDown?: (
    event: React.PointerEvent,
    id: string,
    pinned: boolean
  ) => void;
}) {
  const {
    deleteRecording,
    renameRecording,
    player,
    playerPlaying,
    playRecording,
    togglePlayer,
    stopPlayer,
    setEntryPinned,
    settings,
    selectedEntry,
    selectEntry,
    editRequest,
    clearEditRequest,
  } = usePocket();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(recording.name);
  const rowRef = useRef<HTMLDivElement>(null);
  const pinStyle = settings?.pinControlStyle ?? "hover-toolbar";
  const selected = selectedEntry?.kind === "voice" && selectedEntry.id === recording.id;

  useEffect(() => setName(recording.name), [recording.name]);

  useEffect(() => {
    if (focused) {
      rowRef.current?.scrollIntoView({ block: "center" });
      usePocket.getState().setFocusItem(null);
    }
  }, [focused]);

  useEffect(() => {
    if (editRequest?.kind !== "voice" || editRequest.id !== recording.id) return;
    setRenaming(true);
    clearEditRequest();
  }, [clearEditRequest, editRequest, recording.id]);

  const isCurrent = player?.recordingId === recording.id;
  const playing = isCurrent && playerPlaying;

  const toggle = () => {
    if (isCurrent) {
      togglePlayer();
    } else {
      playRecording(recording);
    }
  };

  const submitRename = async () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== recording.name) {
      await renameRecording(recording.id, trimmed);
    }
    setRenaming(false);
  };

  const togglePin = () =>
    void setEntryPinned("voice", recording.id, !recording.pinned);

  return (
    <div
      ref={rowRef}
      role="listitem"
      tabIndex={0}
      data-tauri-drag-region={pinStyle === "drag" ? undefined : "deep"}
      onPointerDown={(event) =>
        pinStyle === "drag" &&
        onEntryPointerDown?.(event, recording.id, recording.pinned)
      }
      onClick={(event) => {
        if (
          pinStyle === "bottom-bar" &&
          !(event.target as HTMLElement).closest("button, textarea, input, a")
        ) {
          selectEntry(selected ? null : { id: recording.id, kind: "voice" });
        }
      }}
      className={cn(
        "group flex items-center gap-3 px-1 py-3 focus-visible:outline-2 focus-visible:outline-ring",
        selected && "rounded-lg bg-muted/60",
        pinStyle === "drag" && "cursor-grab select-none active:cursor-grabbing"
      )}
    >
      <div className="relative size-8 shrink-0">
        <Button
          size="icon"
          variant="secondary"
          className="size-8 rounded-full"
          aria-label={playing ? "Pause" : "Play"}
          onClick={toggle}
        >
          {playing ? <Pause /> : <Play />}
        </Button>
        {pinStyle === "leading" ? (
          <PinButton
            pinned={recording.pinned}
            onToggle={togglePin}
            className={cn(
              "absolute -right-2 -top-2 size-5 rounded-full bg-background shadow-sm [&_svg]:size-2.5",
              !recording.pinned &&
                "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
            )}
          />
        ) : null}
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
                if (e.key === "Escape") setRenaming(false);
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
        <div className="flex items-center gap-1.5">
          <p className="text-[11px] text-muted-foreground/70">
            {formatDuration(recording.durationMs)} · {formatBytes(recording.sizeBytes)} ·{" "}
            {formatRelative(recording.createdAt)}
          </p>
          {pinStyle === "metadata" ? (
            <PinButton pinned={recording.pinned} onToggle={togglePin} />
          ) : null}
        </div>
        {pinStyle === "hover-toolbar" ? (
          <div className="mt-1 flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <PinButton pinned={recording.pinned} onToggle={togglePin} />
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground"
              aria-label="Rename"
              onClick={() => setRenaming(true)}
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
                void deleteRecording(recording.id);
                toast.success("Recording deleted");
              }}
            >
              <Trash2 />
            </Button>
          </div>
        ) : null}
      </div>

      <div
        className={cn(
          "flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
          pinStyle === "hover-toolbar" && "hidden"
        )}
      >
        <Button
          size="icon"
          variant="ghost"
          className={cn("size-7 text-muted-foreground hover:text-foreground")}
          aria-label="Rename"
          onClick={() => setRenaming(true)}
        >
          <Pencil />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7 text-muted-foreground hover:text-destructive"
          aria-label="Delete recording"
          onClick={() => {
            if (isCurrent) stopPlayer();
            void deleteRecording(recording.id);
            toast.success("Recording deleted");
          }}
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}

/**
 * Persistent mini-player pinned at the bottom of the card while a recording
 * is playing or paused. Owns the single shared audio element; rows only
 * dispatch play/pause/seek through the store.
 */
export function PlayerBar() {
  const {
    player,
    playerPlaying,
    playerTime,
    playerDuration,
    playerSeekRequest,
    togglePlayer,
    stopPlayer,
    requestPlayerSeek,
    skipPlayer,
    reportPlayerProgress,
  } = usePocket();
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
        onError={() => toast.error("Could not load recording")}
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
