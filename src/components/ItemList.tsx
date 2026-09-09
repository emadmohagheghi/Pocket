import { useId, useMemo, useRef, useState } from "react";
import { Mic, Plus, Square } from "lucide-react";
import { toast } from "sonner";

import { usePocket } from "@/store";
import { api } from "@/lib/api";
import { formatDuration } from "@/lib/utils";
import { useRecorder } from "@/hooks/useRecorder";
import type { Item, Recording } from "@/types";
import { ItemRow } from "@/components/ItemRow";
import { VoiceRow } from "@/components/VoiceList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

/** Single unified feed: text items and voice recordings together, newest first. */
export function ItemList() {
  const { data, focusItemId } = usePocket();
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo<Item[]>(() => data?.items ?? [], [data]);

  const groups = useMemo(() => {
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
    const order = ["Today", "Yesterday", "Earlier"];
    const map = new Map<string, FeedEntry[]>();
    for (const entry of entries) {
      const label = groupLabel(entry.createdAt);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(entry);
    }
    return order
      .filter((label) => map.has(label))
      .map((label) => ({ label, entries: map.get(label)! }));
  }, [items, data]);

  const total = groups.reduce((n, g) => n + g.entries.length, 0);
  if (!data || total === 0) return null;

  return (
    <div ref={listRef} className="px-1 pt-1" role="list">
      {groups.map(({ label, entries }) => (
        <section key={label}>
          <SectionLabel>{label}</SectionLabel>
          <div className="divide-y divide-border/70" role="list">
            {entries.map((entry) =>
              entry.kind === "text" ? (
                <ItemRow
                  key={entry.key}
                  item={entry.item}
                  focused={entry.item.id === focusItemId}
                />
              ) : (
                <VoiceRow
                  key={entry.key}
                  recording={entry.recording}
                  focused={entry.recording.id === focusItemId}
                />
              )
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Pinned bottom capture bar (rendered outside the scroll flow). */
export function AddBar() {
  const { createItem, settings, workspaces } = usePocket();
  const [value, setValue] = useState("");
  const [savingVoice, setSavingVoice] = useState(false);
  const inputId = useId();
  const recorder = useRecorder();
  const activeWs = workspaces.find((w) => w.id === settings?.activeWorkspaceId);
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
      toast.success("Voice note saved");
    } catch (error) {
      toast.error(`Could not save recording: ${String(error)}`);
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
      <label
        htmlFor={voiceActive ? undefined : inputId}
        className="flex items-center gap-2.5 rounded-full border border-border/60 bg-muted/50 px-3.5 py-2 transition-colors focus-within:border-border"
      >
        {voiceActive ? (
          <>
            <span
              className={
                "size-2 shrink-0 rounded-full bg-red-500" +
                (recorder.recording ? " animate-pulse" : "")
              }
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
              {savingVoice ? "Saving voice note…" : "Recording…"}
              <span className="font-normal text-muted-foreground">
                {" "}
                → {activeWs?.name ?? "…"}
              </span>
            </span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
              {formatDuration(recorder.elapsedMs)}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 px-2.5 text-xs"
              disabled={savingVoice}
              onClick={() => recorder.cancel()}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 shrink-0 gap-1.5 bg-red-500 px-2.5 text-xs text-white hover:bg-red-600"
              disabled={savingVoice}
              onClick={() => void stopAndSaveVoice()}
            >
              <Square className="size-3 fill-current" /> Save
            </Button>
          </>
        ) : (
          <>
            <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="relative min-w-0 flex-1">
              <Input
                id={inputId}
                value={value}
                type="text"
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setValue("");
                }}
                placeholder="Add a note or a prompt…"
                aria-label="Add a text item"
                className="relative h-auto border-0 !bg-transparent p-0 text-sm shadow-none focus-visible:border-0 focus-visible:ring-0 rounded-none"
              />
            </div>
            <button
              type="button"
              onClick={() => void recorder.start()}
              aria-label="Record a voice note"
              title="Record a voice note"
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Mic className="size-4" />
            </button>
          </>
        )}
      </label>
      {recorder.error && (
        <p className="mt-1 rounded-lg bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {recorder.error}
        </p>
      )}
    </form>
  );
}
