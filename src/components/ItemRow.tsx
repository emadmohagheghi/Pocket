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
import { cn, formatRelative, looksLikeUrl } from "@/lib/utils";
import { playPocketSound } from "@/lib/sound";
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
}

export function ItemRow({ item, focused }: Props) {
  // Field selectors: rows must not re-render on unrelated store traffic such
  // as voice-player progress while a recording plays.
  const updateItem = usePocket((s) => s.updateItem);
  const deleteItem = usePocket((s) => s.deleteItem);
  const setEntryPinned = usePocket((s) => s.setEntryPinned);
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
    if (editing) {
      setDraft(item.content);
      requestAnimationFrame(() => {
        editRef.current?.focus();
        editRef.current?.setSelectionRange(item.content.length, item.content.length);
      });
    }
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

  const togglePin = () => void setEntryPinned("text", item.id, !item.pinned);

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
      value={draft}
      rows={1}
      className="min-h-0 resize-none overflow-hidden border-none bg-transparent p-0 text-sm leading-snug shadow-none [overflow-wrap:anywhere] focus-visible:ring-0"
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          void saveEdit();
        } else if (e.key === "Escape") {
          endEditing();
        }
      }}
      onBlur={() => void saveEdit()}
    />
  );

  const hoverActions = (
    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
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
        onClick={() => setLocalEditing(true)}
      />
      <RowButton
        label="Delete"
        icon={<Trash2 />}
        destructive
        onClick={() => {
          playPocketSound("destructive");
          void deleteItem(item.id);
        }}
      />
    </div>
  );

  return (
    <li
      ref={rowRef}
      tabIndex={0}
      data-tauri-drag-region="deep"
      data-item-id={item.id}
      onKeyDown={onKeyDownRow}
      className="group flex items-start gap-3 rounded-2xl border border-border/60 bg-card px-3 py-2.5 transition-colors hover:border-border"
    >
      <ItemBody
        item={item}
        canCollapse={canCollapse}
        collapseEnabled={collapseEnabled}
        previewStyle={previewStyle}
        isLink={isLink}
        editing={editing}
        editField={editField}
        expanded={expanded}
        setExpanded={setExpanded}
        previewRef={previewRef}
        hoverActions={hoverActions}
      />
    </li>
  );
}

/** Note content: collapsible preview/full/edit branches and the meta row. */
function ItemBody({
  item,
  canCollapse,
  collapseEnabled,
  previewStyle,
  isLink,
  editing,
  editField,
  expanded,
  setExpanded,
  previewRef,
  hoverActions,
}: {
  item: Item;
  canCollapse: boolean;
  collapseEnabled: boolean;
  previewStyle: { WebkitLineClamp: number } | undefined;
  isLink: boolean;
  editing: boolean;
  editField: React.ReactNode;
  expanded: boolean;
  setExpanded: (value: boolean | ((current: boolean) => boolean)) => void;
  previewRef: React.RefObject<HTMLParagraphElement | null>;
  hoverActions: React.ReactNode;
}) {
  // Editing (local or store-requested) always shows the full note.
  const open = expanded || editing;

  return (
    <div className="min-w-0 flex-1">
      {canCollapse ? (
        <CollapsibleItemBody
          item={item}
          open={open}
          editing={editing}
          editField={editField}
          setExpanded={setExpanded}
          previewStyle={previewStyle}
          isLink={isLink}
          previewRef={previewRef}
          hoverActions={hoverActions}
        />
      ) : editing ? (
        editField
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
      {!canCollapse ? (
        <div className="mt-2 flex min-h-6 items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground/70">
            {formatRelative(item.createdAt)}
          </p>
          {hoverActions}
        </div>
      ) : null}
    </div>
  );
}

/** The collapsible preview/full/edit layout for rows over the line limit. */
function CollapsibleItemBody({
  item,
  open,
  editing,
  editField,
  setExpanded,
  previewStyle,
  isLink,
  previewRef,
  hoverActions,
}: {
  item: Item;
  open: boolean;
  editing: boolean;
  editField: React.ReactNode;
  setExpanded: (value: boolean | ((current: boolean) => boolean)) => void;
  previewStyle: { WebkitLineClamp: number } | undefined;
  isLink: boolean;
  previewRef: React.RefObject<HTMLParagraphElement | null>;
  hoverActions: React.ReactNode;
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
          {editing ? (
            editField
          ) : (
            <p
              dir="auto"
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

      <div className="mt-2 flex min-h-6 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="text-[11px] text-muted-foreground/70">
            {formatRelative(item.createdAt)}
          </p>
          {!editing ? (
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
          ) : null}
        </div>
        {hoverActions}
      </div>
    </Collapsible>
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
