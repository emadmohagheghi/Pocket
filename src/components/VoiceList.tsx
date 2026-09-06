import { useEffect, useRef, useState } from "react";
import { AudioLines, Check, Pause, Pencil, Play, Trash2, Volume2 } from "lucide-react";
import { toast } from "sonner";

import { usePocket } from "@/store";
import { api, voiceUrl } from "@/lib/api";
import { cn, formatBytes, formatDuration, formatRelative } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Recording } from "@/types";

export function VoiceList() {
  const { data } = usePocket();
  const recordings = data?.recordings ?? [];

  if (recordings.length === 0) {
    return (
      <div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 p-10 text-center">
        <Volume2 className="size-6 text-muted-foreground/60" />
        <p className="text-sm font-medium text-muted-foreground">No voice notes yet</p>
        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground/80">
          Start a recording from Quick Capture (double Shift → mic icon, or the tray menu). Recordings
          never leave this machine.
        </p>
        <Button
          size="sm"
          className="mt-1"
          onClick={() =>
            api
              .openCapture("voice")
              .catch((e) => toast.error(String(e)))
          }
        >
          <AudioLines className="size-4" /> Record a voice note
        </Button>
      </div>
    );
  }

  const sorted = [...recordings].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="flex flex-col gap-1 p-3" role="list">
      {sorted.map((rec) => (
        <VoiceRow key={rec.id} recording={rec} />
      ))}
    </div>
  );
}

function VoiceRow({ recording }: { recording: Recording }) {
  const { settings, deleteRecording, renameRecording } = usePocket();
  const wsId = settings?.activeWorkspaceId ?? "";
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(recording.name);

  useEffect(() => setName(recording.name), [recording.name]);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play().catch((e) => toast.error(`Playback failed: ${e}`));
    } else {
      el.pause();
    }
  };

  const submitRename = async () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== recording.name) {
      await renameRecording(recording.id, trimmed);
    }
    setRenaming(false);
  };

  return (
    <div
      role="listitem"
      tabIndex={0}
      className="group flex items-center gap-3 rounded-lg border bg-card px-3 py-2 transition-colors hover:border-ring/40 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <Button
        size="icon"
        className="size-9 shrink-0 rounded-full"
        aria-label={playing ? "Pause" : "Play"}
        onClick={toggle}
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </Button>
      <audio
        ref={audioRef}
        src={voiceUrl(wsId, recording.file)}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => toast.error("Could not load recording")}
      />

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
          <p className="truncate text-[13px] font-medium">{recording.name}</p>
        )}
        <p className="text-[11px] text-muted-foreground">
          {formatDuration(recording.durationMs)} · {formatBytes(recording.sizeBytes)} ·{" "}
          {formatRelative(recording.createdAt)}
        </p>
      </div>

      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <Button
          size="icon"
          variant="ghost"
          className={cn("size-7 text-muted-foreground hover:text-foreground")}
          aria-label="Rename"
          onClick={() => setRenaming(true)}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7 text-muted-foreground hover:text-destructive"
          aria-label="Delete recording"
          onClick={() => {
            void deleteRecording(recording.id);
            toast.success("Recording deleted");
          }}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
