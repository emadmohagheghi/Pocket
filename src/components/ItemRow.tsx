import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { PinButton } from "@/components/PinButton";
import type { Item } from "@/types";

interface Props {
  item: Item;
  focused: boolean;
  onEntryDragStart?: (event: React.DragEvent, id: string, pinned: boolean) => void;
}

export function ItemRow({ item, focused, onEntryDragStart }: Props) {
  const {
    updateItem,
    deleteItem,
    setEntryPinned,
    settings,
    selectedEntry,
    selectEntry,
    editRequest,
    clearEditRequest,
  } = usePocket();
  const [isExpandable, setIsExpandable] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.content);
  const rowRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLParagraphElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const previewLineLimit = settings?.notePreviewLines ?? 5;
  const pinStyle = settings?.pinControlStyle ?? "hover-toolbar";
  const selected = selectedEntry?.kind === "text" && selectedEntry.id === item.id;
  const collapseEnabled = previewLineLimit > 0;
  const canCollapse = collapseEnabled && isExpandable;
  const previewStyle = collapseEnabled
    ? { WebkitLineClamp: previewLineLimit }
    : undefined;

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

  useEffect(() => {
    if (editRequest?.kind !== "text" || editRequest.id !== item.id) return;
    if (canCollapse) setExpanded(true);
    setEditing(true);
    clearEditRequest();
  }, [canCollapse, clearEditRequest, editRequest, item.id]);

  useLayoutEffect(() => {
    if (!collapseEnabled) {
      setIsExpandable(false);
      setExpanded(false);
      return;
    }

    const preview = previewRef.current;
    if (!preview) return;

    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const overflowsFiveLines = preview.scrollHeight > preview.clientHeight + 1;
      setIsExpandable((current) =>
        current === overflowsFiveLines ? current : overflowsFiveLines
      );
      if (!overflowsFiveLines) setExpanded(false);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(preview);
    void document.fonts.ready.then(measure);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [collapseEnabled, editing, isExpandable, item.content, previewLineLimit]);

  useEffect(() => {
    if (!expanded || editing) return;

    const collapseOnOutsideClick = (event: PointerEvent) => {
      if (!rowRef.current?.contains(event.target as Node)) {
        setExpanded(false);
      }
    };
    const collapseOnWindowBlur = () => setExpanded(false);

    document.addEventListener("pointerdown", collapseOnOutsideClick);
    window.addEventListener("blur", collapseOnWindowBlur);
    return () => {
      document.removeEventListener("pointerdown", collapseOnOutsideClick);
      window.removeEventListener("blur", collapseOnWindowBlur);
    };
  }, [editing, expanded]);

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

  const togglePin = () => void setEntryPinned("text", item.id, !item.pinned);

  const onKeyDownRow = (e: React.KeyboardEvent) => {
    if (
      editing ||
      (e.target as HTMLElement).closest("button, textarea, input, a")
    ) return;
    if (e.key === "c" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      void copy();
    } else if (e.key === "e") {
      e.preventDefault();
      if (canCollapse) setExpanded(true);
      setEditing(true);
    } else if (e.key.toLowerCase() === "p" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      togglePin();
    } else if (e.key === "Enter" && canCollapse) {
      e.preventDefault();
      setExpanded((current) => !current);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      void deleteItem(item.id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setExpanded(false);
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
      aria-expanded={canCollapse ? expanded : undefined}
      data-tauri-drag-region={pinStyle === "drag" ? undefined : "deep"}
      data-item-id={item.id}
      draggable={pinStyle === "drag"}
      onDragStart={(event) => onEntryDragStart?.(event, item.id, item.pinned)}
      onClick={(event) => {
        if (
          pinStyle === "bottom-bar" &&
          !(event.target as HTMLElement).closest("button, textarea, input, a")
        ) {
          selectEntry(selected ? null : { id: item.id, kind: "text" });
        }
      }}
      onKeyDown={onKeyDownRow}
      className={cn(
        "group flex items-start gap-3 px-1 py-3 focus-visible:outline-2 focus-visible:outline-ring",
        selected && "rounded-lg bg-muted/60",
        pinStyle === "drag" && "cursor-grab active:cursor-grabbing"
      )}
    >
      <div className="relative flex size-8 shrink-0 items-center justify-center">
        {pinStyle === "leading" ? (
          <>
            <SquarePen
              className={cn(
                "size-4 text-muted-foreground/60 transition-opacity",
                item.pinned && "opacity-0",
                !item.pinned &&
                  "group-hover:opacity-0 group-focus-within:opacity-0"
              )}
              aria-hidden
            />
            <PinButton
              pinned={item.pinned}
              onToggle={togglePin}
              className={cn(
                "absolute",
                !item.pinned &&
                  "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              )}
            />
          </>
        ) : (
          <SquarePen className="size-4 text-muted-foreground/60" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {canCollapse ? (
          <Collapsible open={expanded} onOpenChange={setExpanded}>
            <div className="grid min-w-0">
              <p
                ref={previewRef}
                aria-hidden={expanded}
                style={previewStyle}
                className={cn(
                  "col-start-1 row-start-1 self-start overflow-hidden whitespace-pre-wrap text-sm font-normal leading-snug text-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [overflow-wrap:anywhere] transition-opacity duration-150",
                  expanded && "pointer-events-none opacity-0",
                  isLink && "text-primary underline-offset-2 hover:underline"
                )}
              >
                {item.content}
              </p>

              <CollapsibleContent
                aria-hidden={!expanded}
                className="col-start-1 row-start-1 min-h-0 min-w-0 self-start overflow-hidden data-[state=closed]:pointer-events-none data-[state=closed]:animate-[pocket-collapsible-up_180ms_ease-in] data-[state=open]:animate-[pocket-collapsible-down_220ms_ease-out] motion-reduce:animate-none"
              >
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
              </CollapsibleContent>
            </div>

            <div className="mt-1 flex items-center gap-1.5">
              <p className="text-[11px] text-muted-foreground/70">
                {formatRelative(item.createdAt)}
              </p>
              {pinStyle === "metadata" ? (
                <PinButton pinned={item.pinned} onToggle={togglePin} />
              ) : null}
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="h-5 px-1.5 text-[11px] text-muted-foreground"
                >
                  {expanded ? (
                    <ChevronUp data-icon="inline-start" />
                  ) : (
                    <ChevronDown data-icon="inline-start" />
                  )}
                  {expanded ? "Show less" : "Show more"}
                </Button>
              </CollapsibleTrigger>
            </div>
          </Collapsible>
        ) : editing ? (
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
            ref={previewRef}
            style={previewStyle}
            className={cn(
              "whitespace-pre-wrap text-sm font-normal leading-snug text-foreground [overflow-wrap:anywhere]",
              collapseEnabled && "overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical]",
              isLink && "text-primary underline-offset-2 hover:underline"
            )}
          >
            {item.content}
          </p>
        )}
        {!canCollapse ? (
          <div className="mt-1 flex items-center gap-1.5">
            <p className="text-[11px] text-muted-foreground/70">
              {formatRelative(item.createdAt)}
            </p>
            {pinStyle === "metadata" ? (
              <PinButton pinned={item.pinned} onToggle={togglePin} />
            ) : null}
          </div>
        ) : null}

        {pinStyle === "hover-toolbar" ? (
          <div className="mt-1 flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <PinButton pinned={item.pinned} onToggle={togglePin} />
            {isLink ? (
              <RowButton
                label="Open in browser"
                icon={<ExternalLink />}
                onClick={() => void api.openUrl(linkTarget).catch(() => {})}
              />
            ) : null}
            <RowButton label="Copy" icon={<Copy />} onClick={() => void copy()} />
            <RowButton
              label="Edit"
              icon={<Pencil />}
              onClick={() => {
                if (canCollapse) setExpanded(true);
                setEditing(true);
              }}
            />
            <RowButton
              label="Delete"
              icon={<Trash2 />}
              destructive
              onClick={() => void deleteItem(item.id)}
            />
          </div>
        ) : null}
      </div>

      <div
        className={cn(
          "flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100",
          pinStyle === "hover-toolbar" && "hidden"
        )}
      >
        {isLink ? (
          <RowButton
            label="Open in browser"
            icon={<ExternalLink />}
            onClick={() => void api.openUrl(linkTarget).catch(() => {})}
          />
        ) : null}
        <RowButton
          label="Copy"
          icon={<Copy />}
          onClick={() => void copy()}
        />
        <RowButton
          label="Edit"
          icon={<Pencil />}
          onClick={() => {
            if (canCollapse) setExpanded(true);
            setEditing(true);
          }}
        />
        <RowButton
          label="Delete"
          icon={<Trash2 />}
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
      size="icon-sm"
      variant="ghost"
      title={label}
      aria-label={label}
      disabled={disabled}
      className={cn(
        "text-muted-foreground hover:text-foreground",
        destructive && "hover:text-destructive"
      )}
      onClick={onClick}
    >
      {icon}
    </Button>
  );
}
