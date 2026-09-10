import { useEffect, useRef, useState } from "react";
import {
  Copy,
  ExternalLink,
  Pencil,
  SquarePen,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { usePocket } from "@/store";
import { api } from "@/lib/api";
import { cn, formatRelative, looksLikeUrl } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Item } from "@/types";

interface Props {
  item: Item;
  focused: boolean;
}

export function ItemRow({ item, focused }: Props) {
  const { updateItem, deleteItem } = usePocket();
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
      toast.success("Copied to clipboard");
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
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      void deleteItem(item.id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      rowRef.current?.blur();
    }
  };

  // Link rendering is purely visual: any text item that *is* a URL renders
  // as a clickable link. Detected at render time, never persisted as a type.
  const isLink = looksLikeUrl(item.content) || (item.url !== null && looksLikeUrl(item.url));
  const linkTarget = item.url ?? item.content;

  return (
    <div
      ref={rowRef}
      role="listitem"
      tabIndex={0}
      data-tauri-drag-region="deep"
      data-item-id={item.id}
      onKeyDown={onKeyDownRow}
      className="group flex items-start gap-3 px-1 py-3 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <div className="flex size-8 shrink-0 items-center justify-center">
        <SquarePen className="size-4 text-muted-foreground/60" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        {editing ? (
          <Textarea
            ref={editRef}
            value={draft}
            rows={1}
            className="min-h-0 resize-none overflow-hidden border-none bg-transparent p-0 text-sm leading-snug shadow-none [overflow-wrap:anywhere] focus-visible:ring-0"
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
          <p
            className={cn(
              "whitespace-pre-wrap text-sm font-normal leading-snug text-foreground [overflow-wrap:anywhere]",
              isLink && "text-primary underline-offset-2 hover:underline"
            )}
          >
            {item.content}
          </p>
        )}
        <p className="mt-1 text-[11px] text-muted-foreground/70">
          {formatRelative(item.createdAt)}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100">
        {isLink ? (
          <RowButton
            label="Open in browser"
            icon={<ExternalLink className="size-3.5" />}
            onClick={() => void api.openUrl(linkTarget).catch(() => {})}
          />
        ) : null}
        <RowButton
          label="Copy"
          icon={<Copy className="size-3.5" />}
          onClick={() => void copy()}
        />
        <RowButton
          label="Edit"
          icon={<Pencil className="size-3.5" />}
          onClick={() => setEditing(true)}
        />
        <RowButton
          label="Delete"
          icon={<Trash2 className="size-3.5" />}
          destructive
          onClick={() => void deleteItem(item.id)}
        />
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
