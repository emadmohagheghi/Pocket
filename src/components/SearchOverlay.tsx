import { useEffect, useRef, useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import { toast } from "sonner";

import { usePocket } from "@/store";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";
import type { SearchHit, Section } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const KIND_TO_SECTION: Record<string, Section> = {
  text: "inbox",
  note: "notes",
  prompt: "prompts",
  task: "tasks",
  link: "links",
  voice: "voice",
};

export function SearchOverlay({ open, onOpenChange }: Props) {
  const { settings, setView, setFocusItem } = usePocket();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHits([]);
      setSelected(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (!query.trim()) {
      setHits([]);
      return;
    }
    timerRef.current = window.setTimeout(() => {
      if (!settings) return;
      void api
        .search(settings.activeWorkspaceId, query)
        .then((r) => {
          setHits(r);
          setSelected(0);
        })
        .catch((e) => toast.error(String(e)));
    }, 120);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [query, settings]);

  if (!open) return null;

  const activate = (hit: SearchHit) => {
    onOpenChange(false);
    const section = KIND_TO_SECTION[hit.kind] ?? "inbox";
    setView(section);
    if (hit.kind !== "voice") setFocusItem(hit.id);
    if (hit.kind === "voice") {
      void api.copyToClipboard(hit.title).then(() => toast.success("Recording name copied"));
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter" && hits[selected]) {
      e.preventDefault();
      activate(hits[selected]);
    } else if (e.key === "Escape") {
      onOpenChange(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[12vh]"
      onClick={() => onOpenChange(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Search workspace"
    >
      <div
        className="w-[560px] max-w-[90vw] overflow-hidden rounded-xl border bg-popover shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            placeholder="Search notes, prompts, links, tasks, voice…"
            className="h-11 border-0 bg-transparent shadow-none focus-visible:ring-0"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Search query"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div className="max-h-[320px] overflow-y-auto p-1.5">
          {query.trim() === "" ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Searches only this workspace — nothing leaves your machine.
            </p>
          ) : hits.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">No matches.</p>
          ) : (
            hits.map((hit, i) => (
              <button
                key={`${hit.kind}-${hit.id}`}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left",
                  i === selected && "bg-accent text-accent-foreground"
                )}
                onMouseEnter={() => setSelected(i)}
                onClick={() => activate(hit)}
              >
                <Badge variant="secondary" className="mt-0.5 shrink-0 capitalize text-[10px]">
                  {hit.kind}
                </Badge>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{hit.title}</span>
                  {hit.snippet && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {hit.snippet}
                    </span>
                  )}
                </span>
                {i === selected && <CornerDownLeft className="mt-1 size-3.5 shrink-0 text-muted-foreground" />}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
