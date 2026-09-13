import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Pencil,
  Trash2,
} from "lucide-react";

import { usePocket } from "@/store";
import { api } from "@/lib/api";
import { cn, looksLikeUrl } from "@/lib/utils";
import { playPocketSound } from "@/lib/sound";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import type { Item } from "@/types";

interface Props {
  item: Item;
  focused: boolean;
}

export function ItemRow({ item, focused }: Props) {
  // Field selectors: rows must not re-render on unrelated store traffic such
  // as voice-player progress while a recording plays.
  const updateItem = usePocket((s) => s.updateItem);
  const deleteItem = usePocket((s) => s.deleteItem);
  const clearEditRequest = usePocket((s) => s.clearEditRequest);
  const editRequest = usePocket((s) => s.editRequest);
  const previewLineLimit = usePocket((s) => s.settings?.notePreviewLines ?? 5);
  const [isExpandable, setIsExpandable] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [localEditing, setLocalEditing] = useState(false);
  const [draft, setDraft] = useState(item.content);
  const rowRef = useRef<HTMLLIElement>(null);
  const previewRef = useRef<HTMLParagraphElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const collapseEnabled = previewLineLimit > 0;
  const canCollapse = collapseEnabled && isExpandable;
  const previewStyle = collapseEnabled
    ? { WebkitLineClamp: previewLineLimit }
    : undefined;

  // An outstanding store edit request (from search) drives editing by
  // derivation — the row is editing while its request is open, so no effect
  // is needed to copy the request into local state.
  const editNonce =
    editRequest?.kind === "text" && editRequest.id === item.id
      ? editRequest.nonce
      : null;
  const editing = localEditing || editNonce !== null;

  useEffect(() => {
    if (focused) {
      rowRef.current?.scrollIntoView({ block: "center" });
      rowRef.current?.focus();
      usePocket.getState().setFocusItem(null);
    }
  }, [focused]);

  useEffect(() => {
    if (!editing) return;
    setDraft(item.content);
    // Radix restores focus to the card after the context menu closes —
    // after our first frame. Keep claiming focus until the field has it,
    // caret at the end, or entering edit from the menu appears dead.
    const focus = () => {
      if (document.activeElement === editRef.current) return true;
      editRef.current?.focus();
      editRef.current?.setSelectionRange(item.content.length, item.content.length);
      return document.activeElement === editRef.current;
    };
    let raf = 0;
    const tries = [0, 50, 150].map((delay) =>
      window.setTimeout(() => {
        if (focus()) return;
        if (delay === 0) raf = requestAnimationFrame(() => void focus());
      }, delay)
    );
    return () => {
      tries.forEach(clearTimeout);
      cancelAnimationFrame(raf);
    };
  }, [editing, item.content]);

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
      const overflows = preview.scrollHeight > preview.clientHeight + 1;
      setIsExpandable((current) => (current === overflows ? current : overflows));
      if (!overflows) setExpanded(false);
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
      playPocketSound("copy");
    } catch {
      playPocketSound("error");
    }
  };

  const editStartedAt = useRef(0);
  useEffect(() => {
    if (editing) editStartedAt.current = Date.now();
  }, [editing]);

  const endEditing = () => {
    setLocalEditing(false);
    clearEditRequest();
  };

  const saveEdit = async () => {
    const content = draft.trim();
    if (content && content !== item.content) {
      await updateItem(item.id, { content });
    }
    endEditing();
  };

  const onKeyDownRow = (e: React.KeyboardEvent) => {
    if (
      editing ||
      (e.target as HTMLElement).closest("button, textarea, input, a")
    ) return;
    if (e.key === "Enter" && canCollapse) {
      e.preventDefault();
      setExpanded((current) => !current);
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

  // One shared editing field for both the collapsible and plain layouts.
  const editField = (
    <Textarea
      ref={editRef}
      dir="auto"
      autoFocus
      value={draft}
      rows={1}
      className="field-sizing-content max-h-64 w-full resize-none border-none bg-transparent p-0 text-sm leading-snug shadow-none outline-none [overflow-wrap:anywhere]"
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        // Enter commits, Shift+Enter is a newline, Escape cancels.
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          void saveEdit();
        } else if (e.key === "Escape") {
          endEditing();
        }
      }}
      // Guarded blur-save: the context menu's close shuffles focus through
      // the card right after Edit is chosen, which must not close the
      // editor (and looks like Edit doing nothing).
      onBlur={() => {
        if (Date.now() - editStartedAt.current > 250) void saveEdit();
      }}
    />
  );


  const deleteEntry = () => {
    playPocketSound("destructive");
    void deleteItem(item.id);
  };

  const contextMenu = (
    <ContextMenuContent>
      {isLink ? (
        <ContextMenuItem onSelect={() => void api.openUrl(linkTarget).catch(() => {})}>
          <ExternalLink /> Open in browser
        </ContextMenuItem>
      ) : null}
      <ContextMenuItem onSelect={() => void copy()}>
        <Copy /> Copy
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => setLocalEditing(true)}>
        <Pencil /> Edit
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onSelect={deleteEntry}>
        <Trash2 /> Delete
      </ContextMenuItem>
    </ContextMenuContent>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <li
          ref={rowRef}
          tabIndex={0}
          data-item-id={item.id}
          onKeyDown={onKeyDownRow}
          className="group flex items-start gap-3 rounded-2xl border border-border/60 bg-card px-3 py-2.5 transition-colors hover:border-border data-[state=open]:border-blue-500"
        >
          {editing ? (
            editField
          ) : (
            <ItemBody
              item={item}
              canCollapse={canCollapse}
              collapseEnabled={collapseEnabled}
              previewStyle={previewStyle}
              isLink={isLink}
              expanded={expanded}
              setExpanded={setExpanded}
              previewRef={previewRef}
            />
          )}
        </li>
      </ContextMenuTrigger>
      {contextMenu}
    </ContextMenu>
  );
}

/** Note content: collapsible preview/full/edit branches. */
function ItemBody({
  item,
  canCollapse,
  collapseEnabled,
  previewStyle,
  isLink,
  expanded,
  setExpanded,
  previewRef,
}: {
  item: Item;
  canCollapse: boolean;
  collapseEnabled: boolean;
  previewStyle: { WebkitLineClamp: number } | undefined;
  isLink: boolean;
  expanded: boolean;
  setExpanded: (value: boolean | ((current: boolean) => boolean)) => void;
  previewRef: React.RefObject<HTMLParagraphElement | null>;
}) {
  const open = expanded;

  return (
    <div className="min-w-0 flex-1">
      {canCollapse ? (
        <CollapsibleItemBody
          item={item}
          open={open}
          setExpanded={setExpanded}
          previewStyle={previewStyle}
          isLink={isLink}
          previewRef={previewRef}
        />
      ) : (
        <p
          ref={previewRef}
          dir="auto"
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
    </div>
  );
}

/** The collapsible preview/full/edit layout for rows over the line limit. */
function CollapsibleItemBody({
  item,
  open,
  setExpanded,
  previewStyle,
  isLink,
  previewRef,
}: {
  item: Item;
  open: boolean;
  setExpanded: (value: boolean | ((current: boolean) => boolean)) => void;
  previewStyle: { WebkitLineClamp: number } | undefined;
  isLink: boolean;
  previewRef: React.RefObject<HTMLParagraphElement | null>;
}) {
  return (
    <Collapsible open={open} onOpenChange={setExpanded}>
      <div className="grid min-w-0">
        <p
          ref={previewRef}
          dir="auto"
          aria-hidden={open}
          style={previewStyle}
          className={cn(
            "col-start-1 row-start-1 self-start overflow-hidden whitespace-pre-wrap text-sm font-normal leading-snug text-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [overflow-wrap:anywhere] transition-opacity duration-150",
            open && "pointer-events-none opacity-0",
            isLink && "text-primary underline-offset-2 hover:underline"
          )}
        >
          {item.content}
        </p>

        <CollapsibleContent
          aria-hidden={!open}
          className="col-start-1 row-start-1 min-h-0 min-w-0 self-start overflow-hidden data-[state=closed]:pointer-events-none data-[state=closed]:animate-[pocket-collapsible-up_180ms_ease-in] data-[state=open]:animate-[pocket-collapsible-down_220ms_ease-out] motion-reduce:animate-none"
        >
          <p
            dir="auto"
            className={cn(
              "whitespace-pre-wrap text-sm font-normal leading-snug text-foreground [overflow-wrap:anywhere]",
              isLink && "text-primary underline-offset-2 hover:underline"
            )}
          >
            {item.content}
          </p>
        </CollapsibleContent>
      </div>

      {
        <div className="mt-2 flex min-h-6 items-center justify-end gap-1.5">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="h-5 px-1.5 text-[11px] text-muted-foreground"
            >
              {open ? (
                <ChevronUp data-icon="inline-start" />
              ) : (
                <ChevronDown data-icon="inline-start" />
              )}
              {open ? "Show less" : "Show more"}
            </Button>
          </CollapsibleTrigger>
        </div>
      }
    </Collapsible>
  );
}
