import { useEffect, useRef, useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import { toast } from "sonner";

import { usePocket } from "@/store";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";
import type { SearchHit } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SearchOverlay({ open, onOpenChange }: Props) {
  const { settings, setFocusItem } = usePocket();
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
    // Single unified feed: every hit just focuses its row.
    setFocusItem(hit.id);
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
      className="fixed inset-3 z-50 flex items-start justify-center rounded-3xl bg-black/40 pt-[11vh]"
      onClick={() => onOpenChange(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Search workspace"
    >
      <div
        className="w-[560px] max-w-[90vw] overflow-hidden rounded-2xl border border-border/60 bg-popover"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-4 py-1">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            placeholder="Search text and voice…"
            className="h-11 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Search query"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div className="max-h-[320px] space-y-0.5 overflow-y-auto border-t border-border/60 p-2">
          {query.trim() === "" ? (
            <p className="px-4 py-8 text-center text-[11px] leading-relaxed text-muted-foreground/70">
              Searches only this workspace — nothing leaves your machine.
            </p>
          ) : hits.length === 0 ? (
            <p className="px-4 py-8 text-center text-[11px] leading-relaxed text-muted-foreground/70">No matches.</p>
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
