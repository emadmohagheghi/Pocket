import { forwardRef, useId, useMemo, useRef, useState } from "react";
import { Loader2, Mic, Pause, Pin, Play, Plus, Square, X } from "lucide-react";

import { usePocket } from "@/store";
import { api } from "@/lib/api";
import { cn, formatDuration } from "@/lib/utils";
import { playPocketSound } from "@/lib/sound";
import { useRecorder } from "@/hooks/useRecorder";
import type { EntryKind, Item, Recording } from "@/types";
import { ItemRow } from "@/components/ItemRow";
import { VoiceRow } from "@/components/VoiceList";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/** Small uppercase muted section label. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-1 pb-1 pt-6 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70 first:pt-0">
      {children}
    </p>
  );
}

function groupLabel(createdAt: number): string {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (createdAt >= startOfToday) return "Today";
  if (createdAt >= startOfToday - 86400000) return "Yesterday";
  return "Earlier";
}

type FeedEntry =
  | { key: string; createdAt: number; kind: "text"; item: Item }
  | { key: string; createdAt: number; kind: "voice"; recording: Recording };

const CAPTURE_BAR_CLASS =
  "flex items-center gap-2.5 rounded-full border border-border/60 bg-muted/50 px-3.5 py-2 transition-colors focus-within:border-border";

/** Single unified feed: text items and voice recordings together, newest first. */
export function ItemList() {
  const { data, focusItemId, settings, setEntryPinned } = usePocket();
  const listRef = useRef<HTMLDivElement>(null);
  const pinDropRef = useRef<HTMLDivElement>(null);
  const unpinDropRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{
    id: string;
    kind: EntryKind;
    pinned: boolean;
  } | null>(null);
  const [dragTarget, setDragTarget] = useState<boolean | null>(null);

  const items = useMemo<Item[]>(() => data?.items ?? [], [data]);

  const { pinnedEntries, groups } = useMemo(() => {
    const entries: FeedEntry[] = [
      ...items.map(
        (item): FeedEntry => ({
          key: item.id,
          createdAt: item.createdAt,
          kind: "text",
          item,
        })
      ),
      ...(data?.recordings ?? []).map(
        (recording): FeedEntry => ({
          key: recording.id,
          createdAt: recording.createdAt,
          kind: "voice",
          recording,
        })
      ),
    ].sort((a, b) => b.createdAt - a.createdAt);
    const pinnedEntries = entries.filter((entry) =>
      entry.kind === "text" ? entry.item.pinned : entry.recording.pinned
    );
    const chronologicalEntries = entries.filter((entry) =>
      entry.kind === "text" ? !entry.item.pinned : !entry.recording.pinned
    );
    const order = ["Today", "Yesterday", "Earlier"];
    const map = new Map<string, FeedEntry[]>();
    for (const entry of chronologicalEntries) {
      const label = groupLabel(entry.createdAt);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(entry);
    }
    return {
      pinnedEntries,
      groups: order
        .filter((label) => map.has(label))
        .map((label) => ({ label, entries: map.get(label)! })),
    };
  }, [items, data]);

  const total = pinnedEntries.length + groups.reduce((n, g) => n + g.entries.length, 0);
  if (!data || total === 0) return null;

  const dragMode = settings?.pinControlStyle === "drag";

  const startPointerDrag = (
    event: React.PointerEvent,
    kind: EntryKind,
    id: string,
    pinned: boolean
  ) => {
    if (
      event.button !== 0 ||
      (event.target as HTMLElement).closest("button, textarea, input, a")
    ) {
      return;
    }

    const source = { kind, id, pinned };
    const startX = event.clientX;
    const startY = event.clientY;
    const pointerId = event.pointerId;
    const captureElement = event.currentTarget as HTMLElement;
    let activated = false;
    captureElement.setPointerCapture(pointerId);

    const targetAt = (clientX: number, clientY: number): boolean | null => {
      const contains = (element: HTMLDivElement | null) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        return (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        );
      };
      if (contains(pinDropRef.current)) return true;
      if (contains(unpinDropRef.current)) return false;
      return null;
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (captureElement.hasPointerCapture(pointerId)) {
        captureElement.releasePointerCapture(pointerId);
      }
      setDragging(null);
      setDragTarget(null);
    };

    const onMove = (pointerEvent: PointerEvent) => {
      if (!activated) {
        const distance = Math.hypot(
          pointerEvent.clientX - startX,
          pointerEvent.clientY - startY
        );
        if (distance < 6) return;
        activated = true;
        setDragging(source);
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
      }
      pointerEvent.preventDefault();
      setDragTarget(targetAt(pointerEvent.clientX, pointerEvent.clientY));
    };

    const onUp = (pointerEvent: PointerEvent) => {
      if (activated) {
        const target = targetAt(pointerEvent.clientX, pointerEvent.clientY);
        if (target !== null && target !== source.pinned) {
          void setEntryPinned(source.kind, source.id, target);
        }
      }
      cleanup();
    };

    const onCancel = () => cleanup();

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  };

  const renderEntry = (entry: FeedEntry) =>
    entry.kind === "text" ? (
      <ItemRow
        key={entry.key}
        item={entry.item}
        focused={entry.item.id === focusItemId}
        onEntryPointerDown={(event, id, pinned) =>
          startPointerDrag(event, "text", id, pinned)
        }
      />
    ) : (
      <VoiceRow
        key={entry.key}
        recording={entry.recording}
        focused={entry.recording.id === focusItemId}
        onEntryPointerDown={(event, id, pinned) =>
          startPointerDrag(event, "voice", id, pinned)
        }
      />
    );

  return (
    <div
      ref={listRef}
      className="px-1 pt-1"
      role="list"
    >
      {dragMode ? (
        <PinDropZone
          ref={pinDropRef}
          label="Drag here to pin"
          active={Boolean(dragging && !dragging.pinned && dragTarget === true)}
        />
      ) : null}

      {pinnedEntries.length > 0 ? (
        <section>
          <SectionLabel>Pinned</SectionLabel>
          <div className="divide-y divide-border/70" role="list">
            {pinnedEntries.map(renderEntry)}
          </div>
        </section>
      ) : null}

      {dragMode && pinnedEntries.length > 0 ? (
        <PinDropZone
          ref={unpinDropRef}
          label="Drag here to unpin"
          active={Boolean(dragging?.pinned && dragTarget === false)}
        />
      ) : null}

      {groups.map(({ label, entries }) => (
        <section key={label}>
          <SectionLabel>{label}</SectionLabel>
          <div className="divide-y divide-border/70" role="list">
            {entries.map(renderEntry)}
          </div>
        </section>
      ))}
    </div>
  );
}

const PinDropZone = forwardRef<
  HTMLDivElement,
  { label: string; active: boolean }
>(function PinDropZone({ label, active }, ref) {
  return (
    <div
      ref={ref}
      data-tauri-drag-region="false"
      className={cn(
        "my-2 flex h-9 items-center justify-center gap-1.5 rounded-lg border border-dashed text-[11px] text-muted-foreground transition-colors",
        active ? "border-foreground/40 bg-muted text-foreground" : "border-border/60"
      )}
    >
      <Pin className="size-3" aria-hidden />
      {label}
    </div>
  );
});

/** Pinned bottom capture bar (rendered outside the scroll flow). */
export function AddBar() {
  const { createItem, settings } = usePocket();
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
    const result = await recorder.stop();
    if (!result || result.blob.size === 0) {
      setSavingVoice(false);
      return;
    }
    try {
      const buffer = await result.blob.arrayBuffer();
      await api.saveRecording(
        settings?.activeWorkspaceId ?? "",
        `Voice note ${new Date().toLocaleString()}`,
        result.durationMs,
        buffer
      );
      playPocketSound("success");
    } catch (error) {
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
        <div
          className={CAPTURE_BAR_CLASS}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("button, textarea")) return;
            textareaRef.current?.focus();
          }}
        >
          <button
            type="submit"
            aria-label="Add note"
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground"
          >
            <Plus className="size-4" />
          </button>
          <Textarea
            ref={textareaRef}
            id={inputId}
            value={value}
            rows={1}
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
