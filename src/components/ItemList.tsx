import { useMemo, useRef } from "react";

import { usePocket } from "@/store";
import type { Item, Section } from "@/types";
import { ItemRow } from "@/components/ItemRow";

const HINTS: Partial<Record<Exclude<Section, "voice" | "settings">, string>> = {
  prompts: "Queue up prompts for your AI workflows. Copy with one click, mark done when sent.",
  notes: "Longer snippets you want to keep around — instructions, context, ideas.",
  links: "Paste a link in Quick Capture and it lands here automatically.",
  tasks: "Small to-dos related to this workspace.",
  inbox: "Everything captured in this workspace shows up here.",
};

const TYPE_BY_VIEW: Partial<Record<Exclude<Section, "voice" | "settings">, Item["itemType"]>> = {
  prompts: "prompt",
  notes: "note",
  links: "link",
  tasks: "task",
};

export function ItemList({ view }: { view: Exclude<Section, "voice" | "settings"> }) {
  const { data, focusItemId } = usePocket();
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo<Item[]>(() => {
    if (!data) return [];
    const type = TYPE_BY_VIEW[view];
    if (view === "inbox" || !type) return data.items;
    return data.items.filter((i) => i.itemType === type);
  }, [data, view]);

  // Sort: incomplete tasks/prompts first, then newest on top — but keep the
  // prompt queue order intact.
  const ordered = useMemo(() => {
    if (view === "prompts") return items; // queue order (Rust vec order)
    const sorted = [...items];
    sorted.sort((a, b) => b.updatedAt - a.updatedAt);
    return sorted;
  }, [items, view]);

  if (!data || items.length === 0) {
    return (
      <div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 p-10 text-center">
        <p className="text-sm font-medium text-muted-foreground">Nothing here yet</p>
        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground/80">
          {HINTS[view] ?? "Press Shift twice anywhere to capture something in seconds."}
        </p>
      </div>
    );
  }

  return (
    <div ref={listRef} className="flex flex-col gap-1 p-3" role="list">
      {ordered.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          view={view}
          first={item.id === ordered[0]?.id}
          last={item.id === ordered[ordered.length - 1]?.id}
          focused={item.id === focusItemId}
          headId={ordered[0]?.id ?? null}
        />
      ))}
    </div>
  );
}
