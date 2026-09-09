import { useId, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";

import { usePocket } from "@/store";
import type { Item, Recording } from "@/types";
import { ItemRow } from "@/components/ItemRow";
import { VoiceRow } from "@/components/VoiceList";
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
  const { createItem } = usePocket();
  const [value, setValue] = useState("");
  const inputId = useId();

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

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label
        htmlFor={inputId}
        className="flex items-center gap-2.5 rounded-full border border-border/60 bg-muted/50 px-3.5 py-2 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50"
      >
        <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        {/* Placeholder as an under-layer so the caret stays visible while the
            field is empty (the engine paints native placeholders over it). */}
        <div className="relative min-w-0 flex-1">
          {value.length === 0 && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 flex items-center truncate text-sm text-muted-foreground"
            >
              Add a note or a prompt…
            </span>
          )}
          <Input
            id={inputId}
            value={value}
            type="text"
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setValue("");
            }}
            aria-label="Add a text item"
            className="relative h-auto border-0 !bg-transparent p-0 text-sm shadow-none focus-visible:border-0 focus-visible:ring-0"
          />
        </div>
      </label>
    </form>
  );
}
