import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  ExternalLink,
  Pencil,
  Square,
  SquareCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { usePocket } from "@/store";
import { api } from "@/lib/api";
import { cn, formatRelative } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Item } from "@/types";

interface Props {
  item: Item;
  view: string;
  first: boolean;
  last: boolean;
  focused: boolean;
  headId: string | null;
}

export function ItemRow({ item, view, first, last, focused, headId }: Props) {
  const { updateItem, deleteItem, moveItem } = usePocket();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.content);
  const rowRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (focused) {
      rowRef.current?.scrollIntoView({ block: "center" });
      rowRef.current?.focus();
      usePocket.getState().setFocusItem(null);
    }
  }, [focused]);

  useEffect(() => {
    if (editing) {
      setDraft(item.content);
      requestAnimationFrame(() => {
        editRef.current?.focus();
        editRef.current?.setSelectionRange(item.content.length, item.content.length);
      });
    }
  }, [editing, item.content]);

  const copy = async () => {
    try {
      await api.copyToClipboard(item.url ?? item.content);
      toast.success(view === "prompts" ? "Prompt copied" : "Copied to clipboard");
    } catch (e) {
      toast.error(String(e));
    }
  };

  const saveEdit = async () => {
    const content = draft.trim();
    if (content && content !== item.content) {
      await updateItem(item.id, { content });
    }
    setEditing(false);
  };

  const onKeyDownRow = (e: React.KeyboardEvent) => {
    if (editing) return;
    if (e.key === "c" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      void copy();
    } else if (e.key === "e") {
      e.preventDefault();
      setEditing(true);
    } else if ((e.key === "x" || e.key === " ") && (item.itemType === "task" || item.itemType === "prompt")) {
      e.preventDefault();
      void updateItem(item.id, { completed: !item.completed });
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      void deleteItem(item.id);
    } else if (e.altKey && e.key === "ArrowUp" && !first) {
      e.preventDefault();
      void moveItem(item.id, null);
    } else if (e.altKey && e.key === "ArrowDown" && !last) {
      e.preventDefault();
      void moveItem(item.id, null);
    }
  };

  const isQueue = item.itemType === "task" || item.itemType === "prompt";
  const isLink = item.itemType === "link";

  return (
    <div
      ref={rowRef}
      role="listitem"
      tabIndex={0}
      data-item-id={item.id}
      onKeyDown={onKeyDownRow}
      className={cn(
        "group rounded-lg border bg-card px-3 py-2 transition-colors",
        "hover:border-ring/40 focus-visible:outline-2 focus-visible:outline-ring",
        item.completed && "opacity-55"
      )}
    >
      <div className="flex items-start gap-2.5">
        {isQueue && (
          <button
            aria-label={item.completed ? "Mark as not done" : "Mark as done"}
            className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => void updateItem(item.id, { completed: !item.completed })}
          >
            {item.completed ? (
              <SquareCheck className="size-4 text-emerald-600" />
            ) : (
              <Square className="size-4" />
            )}
          </button>
        )}

        <div className="min-w-0 flex-1">
          {editing ? (
            <Textarea
              ref={editRef}
              value={draft}
              rows={Math.min(8, Math.max(2, draft.split("\n").length))}
              className="min-h-0 resize-none border-none bg-transparent p-0 text-[13px] shadow-none focus-visible:ring-0"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void saveEdit();
                } else if (e.key === "Escape") {
                  setEditing(false);
                }
              }}
              onBlur={() => void saveEdit()}
            />
          ) : (
            <>
              <p
                className={cn(
                  "whitespace-pre-wrap break-words text-[13px] leading-relaxed",
                  isLink && "cursor-pointer text-primary underline-offset-2 hover:underline"
                )}
                onClick={() => {
                  const url = item.url ?? (isLink ? item.content : null);
                  if (isLink && url) void api.openUrl(url).catch(() => {});
                }}
              >
                {isLink ? (item.title ?? item.url ?? item.content) : item.content}
              </p>
              {isLink && item.title && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.url}</p>
              )}
            </>
          )}
          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>{formatRelative(item.createdAt)}</span>
            {isQueue && item.completed && <span>· done</span>}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100">
          {isLink ? (
          <RowButton
            label="Open in browser"
            icon={<ExternalLink className="size-3.5" />}
            onClick={() => {
              const url = item.url ?? item.content;
              void api.openUrl(url).catch(() => {});
            }}
          />
          ) : null}
          <RowButton label="Copy" icon={<Copy className="size-3.5" />} onClick={() => void copy()} />
          <RowButton
            label="Edit"
            icon={<Pencil className="size-3.5" />}
            onClick={() => setEditing(true)}
          />
          <RowButton
            label="Move to top"
            icon={<ArrowUp className="size-3.5" />}
            disabled={first}
            onClick={() => void moveItem(item.id, headId && headId !== item.id ? headId : null)}
          />
          <RowButton
            label="Move to end"
            icon={<ArrowDown className="size-3.5" />}
            disabled={last}
            onClick={() => {
              void moveItem(item.id, null);
            }}
          />
          <RowButton
            label="Delete"
            icon={<Trash2 className="size-3.5" />}
            destructive
            onClick={() => void deleteItem(item.id)}
          />
        </div>
      </div>
    </div>
  );
}

function RowButton({
  label,
  icon,
  onClick,
  destructive,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <Button
      size="icon"
      variant="ghost"
      title={label}
      aria-label={label}
      disabled={disabled}
      className={cn(
        "size-7 text-muted-foreground hover:text-foreground",
        destructive && "hover:text-destructive"
      )}
      onClick={onClick}
    >
      {icon}
    </Button>
  );
}
