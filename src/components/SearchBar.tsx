import { useEffect, useId, useState, type RefObject } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import { toast } from "sonner";

import { usePocket } from "@/store";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import type { SearchHit } from "@/types";

interface SearchBarProps {
  inputRef: RefObject<HTMLInputElement | null>;
}

/** Persistent workspace search input with live results directly beneath it. */
export function SearchBar({ inputRef }: SearchBarProps) {
  const workspaceId = usePocket((state) => state.settings?.activeWorkspaceId);
  const setFocusItem = usePocket((state) => state.setFocusItem);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [selected, setSelected] = useState(0);
  const [searching, setSearching] = useState(false);
  const inputId = useId();
  const resultsId = useId();
  const trimmedQuery = query.trim();
  const showResults = trimmedQuery.length > 0;

  useEffect(() => {
    let cancelled = false;

    setHits([]);
    setSelected(0);
    if (!trimmedQuery || !workspaceId) {
      setSearching(false);
      return;
    }

    setSearching(true);
    const timer = window.setTimeout(() => {
      void api
        .search(workspaceId, trimmedQuery)
        .then((results) => {
          if (cancelled) return;
          setHits(results);
          setSearching(false);
        })
        .catch((error) => {
          if (cancelled) return;
          setSearching(false);
          toast.error(String(error));
        });
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [trimmedQuery, workspaceId]);

  const activate = (hit: SearchHit) => {
    setQuery("");
    setHits([]);
    setFocusItem(hit.id);
    inputRef.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && hits.length > 0) {
      event.preventDefault();
      setSelected((current) => Math.min(current + 1, hits.length - 1));
    } else if (event.key === "ArrowUp" && hits.length > 0) {
      event.preventDefault();
      setSelected((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && hits[selected]) {
      event.preventDefault();
      activate(hits[selected]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setQuery("");
      setHits([]);
    }
  };

  return (
    <div className="relative min-w-0 flex-1">
      <label
        htmlFor={inputId}
        className="flex items-center gap-2.5 rounded-xl bg-muted/60 px-3.5 py-2.5 transition-colors focus-within:bg-muted"
      >
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="relative min-w-0 flex-1">
          <Input
            id={inputId}
            ref={inputRef}
            type="search"
            value={query}
            autoComplete="off"
            placeholder="Search text and voice…"
            aria-label="Search text and voice"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showResults}
            aria-controls={showResults ? resultsId : undefined}
            aria-activedescendant={hits[selected] ? `${resultsId}-${selected}` : undefined}
            className="relative h-auto border-0 !bg-transparent p-0 text-sm shadow-none focus-visible:border-0 focus-visible:ring-0 rounded-none"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <Kbd className="shrink-0 bg-background/70 px-1.5 text-[10px]">Ctrl + K</Kbd>
      </label>

      {showResults ? (
        <div
          id={resultsId}
          role="listbox"
          aria-label="Search results"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-xl border border-border/60 bg-popover p-2 shadow-lg"
        >
          {searching ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">Searching…</p>
          ) : hits.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">No matches.</p>
          ) : (
            hits.map((hit, index) => (
              <button
                id={`${resultsId}-${index}`}
                key={`${hit.kind}-${hit.id}`}
                type="button"
                role="option"
                aria-selected={index === selected}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left",
                  index === selected && "bg-accent text-accent-foreground"
                )}
                onMouseEnter={() => setSelected(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => activate(hit)}
              >
                <Badge variant="secondary" className="mt-0.5 shrink-0 capitalize text-[10px]">
                  {hit.kind}
                </Badge>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{hit.title}</span>
                  {hit.snippet ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {hit.snippet}
                    </span>
                  ) : null}
                </span>
                {index === selected ? (
                  <CornerDownLeft className="mt-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
