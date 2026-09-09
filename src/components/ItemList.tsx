import { useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";

import { usePocket } from "@/store";
import type { Item, Recording } from "@/types";
import { ItemRow } from "@/components/ItemRow";
import { VoiceRow } from "@/components/VoiceList";

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
  const [open, setOpen] = useState(false);

  const save = async () => {
    const text = value.trim();
    if (!text) {
      setValue("");
      setOpen(false);
      return;
    }
    const created = await createItem(text);
    if (created) {
      setValue("");
      setOpen(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2.5 rounded-full border border-border/60 bg-muted/50 px-3.5 py-2.5 text-left text-[13px] text-muted-foreground/70 transition-colors hover:bg-muted hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <Plus className="size-4 shrink-0" />
        Add a note or a prompt…
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2.5 rounded-full border border-border/60 bg-muted/50 px-3.5 py-2">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
          else if (e.key === "Escape") {
            setValue("");
            setOpen(false);
          }
        }}
        onBlur={() => void save()}
        placeholder="Type something, Enter to save…"
        aria-label="Add a text item"
        className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
      />
    </div>
  );
}
