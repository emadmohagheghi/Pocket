import { useId, useMemo, useRef, useState } from "react";
import { Loader2, Mic, Pause, Play, Plus, Square, X } from "lucide-react";

import { usePocket } from "@/store";
import { api } from "@/lib/api";
import { formatDuration } from "@/lib/utils";
import { playPocketSound } from "@/lib/sound";
import { useRecorder } from "@/hooks/useRecorder";
import type { Item, Recording } from "@/types";
import { ItemRow } from "@/components/ItemRow";
import { VoiceRow } from "@/components/VoiceList";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";

type FeedEntry =
  | { key: string; kind: "text"; item: Item }
  | { key: string; kind: "voice"; recording: Recording };

const CAPTURE_BAR_CLASS =
  "flex items-center gap-2.5 rounded-full border border-border/60 bg-card px-3.5 py-2 transition-colors focus-within:border-border";

/**
 * Single unified feed: text items and voice recordings together, oldest at
 * the top and newest at the bottom like a chat. Auto-scrolls while the
 * reader is at the live edge; a jump-to-latest button appears otherwise.
 */
export function ItemList() {
  const data = usePocket((s) => s.data);
  const focusItemId = usePocket((s) => s.focusItemId);

  const entries = useMemo<FeedEntry[]>(() => {
    return [
      ...(data?.items ?? []).map(
        (item): FeedEntry => ({ key: item.id, kind: "text", item })
      ),
      ...(data?.recordings ?? []).map(
        (recording): FeedEntry => ({
          key: recording.id,
          kind: "voice",
          recording,
        })
      ),
    ].sort((a, b) => {
      const aCreated = a.kind === "text" ? a.item.createdAt : a.recording.createdAt;
      const bCreated = b.kind === "text" ? b.item.createdAt : b.recording.createdAt;
      return aCreated - bCreated;
    });
  }, [data]);

  if (!data || entries.length === 0) return null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MessageScrollerProvider autoScroll defaultScrollPosition="end">
        <MessageScroller>
          <MessageScrollerViewport>
            <MessageScrollerContent className="px-1 py-2">
              {entries.map((entry) => (
                <MessageScrollerItem key={entry.key} messageId={entry.key}>
                  {entry.kind === "text" ? (
                    <ItemRow item={entry.item} focused={entry.item.id === focusItemId} />
                  ) : (
                    <VoiceRow
                      recording={entry.recording}
                      focused={entry.recording.id === focusItemId}
                    />
                  )}
                </MessageScrollerItem>
              ))}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>
    </div>
  );
}

/** Pinned bottom capture bar (rendered outside the scroll flow). */
export function AddBar() {
  const createItem = usePocket((s) => s.createItem);
  const activeWorkspaceId = usePocket((s) => s.settings?.activeWorkspaceId);
  const [value, setValue] = useState("");
  const [savingVoice, setSavingVoice] = useState(false);
  const inputId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recorder = useRecorder();
  const voiceActive = recorder.recording || savingVoice;

  const save = async () => {
    const text = value.trim();
    if (!text) {
      setValue("");
      return;
    }
    const created = await createItem(text);
    if (created) {
      setValue("");
      playPocketSound("success");
      textareaRef.current?.focus();
    }
  };

  const stopAndSaveVoice = async () => {
    // Optimistic flag keeps the bar in voice mode across the stop() gap.
    setSavingVoice(true);
    try {
      const result = await recorder.stop();
      if (!result || result.blob.size === 0) return;
      const buffer = await result.blob.arrayBuffer();
      await api.saveRecording(
        activeWorkspaceId ?? "",
        `Voice note ${new Date().toLocaleString()}`,
        result.durationMs,
        buffer
      );
      playPocketSound("success");
    } catch (error) {
      void api.log(`voice AddBar save FAILED: ${error}`);
      playPocketSound("error");
    } finally {
      setSavingVoice(false);
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {voiceActive ? (
        <div className={CAPTURE_BAR_CLASS}>
          <span
            className={
              "size-2 shrink-0 rounded-full " +
              (recorder.paused
                ? "bg-amber-500"
                : "bg-red-500" + (recorder.recording ? " animate-pulse" : ""))
            }
            aria-hidden
          />
          <span
            className="min-w-0 flex-1 font-mono text-xs tabular-nums text-muted-foreground"
            aria-live="polite"
          >
            {formatDuration(recorder.elapsedMs)}
          </span>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            disabled={savingVoice}
            aria-label={recorder.paused ? "Resume recording" : "Pause recording"}
            onClick={() => (recorder.paused ? recorder.resume() : recorder.pause())}
          >
            {recorder.paused ? <Play /> : <Pause />}
          </Button>
          <Button
            type="button"
            size="icon-sm"
            className="shrink-0 rounded-full bg-red-500 text-white hover:bg-red-600"
            disabled={savingVoice}
            aria-label="Save recording"
            onClick={() => void stopAndSaveVoice()}
          >
            {savingVoice ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Square className="size-3.5 fill-current" />
            )}
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            disabled={savingVoice}
            aria-label="Discard recording"
            onClick={() => {
              recorder.cancel();
              playPocketSound("close");
            }}
          >
            <X />
          </Button>
        </div>
      ) : (
        <div className={CAPTURE_BAR_CLASS}>
          <button
            type="submit"
            aria-label="Add note"
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground"
          >
            <Plus className="size-4" />
          </button>
          {/* One control inside the label: clicking the flexible middle area
              of the bar focuses the textarea. */}
          <label htmlFor={inputId} className="block min-w-0 flex-1">
            <Textarea
              ref={textareaRef}
              id={inputId}
              value={value}
              rows={1}
              dir="auto"
              autoComplete="off"
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void save();
                } else if (event.key === "Escape") {
                  setValue("");
                }
              }}
              placeholder="Add a note or a prompt…"
              aria-label="Add a text item"
              className="addbar-textarea max-h-[41px] min-h-0 resize-none overflow-y-auto rounded-none border-none !bg-transparent p-0 text-sm leading-snug shadow-none outline-none [overflow-wrap:anywhere] translate-y-[2px]"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              playPocketSound("open");
              void recorder.start();
            }}
            aria-label="Record a voice note"
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Mic className="size-4" />
          </button>
        </div>
      )}
      {recorder.error && (
        <p className="mt-1 rounded-lg bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {recorder.error}
        </p>
      )}
    </form>
  );
}
