import { Copy, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { PinButton } from "@/components/PinButton";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { usePocket } from "@/store";

export function SelectionBar() {
  const {
    data,
    selectedEntry,
    selectEntry,
    setEntryPinned,
    requestEdit,
    deleteItem,
    deleteRecording,
    player,
    stopPlayer,
  } = usePocket();

  if (!selectedEntry || !data) return null;

  const entry =
    selectedEntry.kind === "text"
      ? data.items.find((item) => item.id === selectedEntry.id)
      : data.recordings.find((recording) => recording.id === selectedEntry.id);

  if (!entry) return null;

  const isText = selectedEntry.kind === "text";
  const label = isText ? "content" in entry && entry.content : "name" in entry && entry.name;

  const copy = async () => {
    if (!isText || !("content" in entry)) return;
    try {
      await api.copyToClipboard(entry.url ?? entry.content);
      toast.success("Copied to clipboard");
    } catch (error) {
      toast.error(String(error));
    }
  };

  const remove = async () => {
    if (isText) {
      await deleteItem(entry.id);
    } else {
      if (player?.recordingId === entry.id) stopPlayer();
      await deleteRecording(entry.id);
    }
    selectEntry(null);
  };

  return (
    <div className="flex items-center gap-1 rounded-full border border-border/60 bg-muted/50 px-2 py-2">
      <p className="min-w-0 flex-1 truncate pl-2 text-xs text-muted-foreground">
        {label}
      </p>
      <PinButton
        pinned={entry.pinned}
        onToggle={() =>
          void setEntryPinned(selectedEntry.kind, entry.id, !entry.pinned)
        }
      />
      {isText ? (
        <Button size="icon-xs" variant="ghost" aria-label="Copy" onClick={() => void copy()}>
          <Copy />
        </Button>
      ) : null}
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label={isText ? "Edit" : "Rename"}
        onClick={() => requestEdit(entry.id, selectedEntry.kind)}
      >
        <Pencil />
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label="Delete"
        className="text-muted-foreground hover:text-destructive"
        onClick={() => void remove()}
      >
        <Trash2 />
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label="Clear selection"
        onClick={() => selectEntry(null)}
      >
        <X />
      </Button>
    </div>
  );
}
