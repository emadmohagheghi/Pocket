import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { usePocket } from "@/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DeleteWorkspaceDialog } from "@/components/DeleteWorkspaceDialog";

/** Workspace list/switch/create/rename/delete, opened from the "…" menu. */
export function WorkspacesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const workspaces = usePocket((s) => s.workspaces);
  const activeWorkspaceId = usePocket((s) => s.settings?.activeWorkspaceId);
  const setActiveWorkspace = usePocket((s) => s.setActiveWorkspace);
  const createWorkspace = usePocket((s) => s.createWorkspace);
  const renameWorkspace = usePocket((s) => s.renameWorkspace);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNewName("");
      setEditingId(null);
      setDeleteTarget(null);
    }
  }, [open ]);

  const submitNew = async () => {
    const name = newName.trim();
    if (!name) return;
    const ws = await createWorkspace(name);
    if (ws) {
      setNewName("");
      await setActiveWorkspace(ws.id);
      onClose();
    }
  };

  const startRename = (id: string, current: string) => {
    setEditingId(id);
    setEditValue(current);
  };

  const submitRename = async () => {
    if (!editingId) return;
    const name = editValue.trim();
    const current = workspaces.find((w) => w.id === editingId)?.name;
    if (name && name !== current) {
      await renameWorkspace(editingId, name);
    }
    setEditingId(null);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-tauri-drag-region="deep" className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Workspaces</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col">
          {workspaces.map((w) => {
            const count = w.counts.texts + w.counts.recordings;
            return (
              <div
                key={w.id}
                className="flex items-center gap-1 rounded-lg px-1 py-1 hover:bg-accent"
              >
                {editingId === w.id ? (
                  <Input
                    autoFocus
                    value={editValue}
                    className="h-8"
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void submitRename();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    onBlur={() => void submitRename()}
                    aria-label="Rename workspace"
                  />
                ) : (
                  <button
                    onClick={() => {
                      void setActiveWorkspace(w.id);
                      onClose();
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 px-1.5 py-1 text-left text-[13px]"
                  >
                    {/* Green dot marks the workspace captures are going to. */}
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        activeWorkspaceId === w.id ? "bg-emerald-500" : "bg-transparent"
                      )}
                      aria-hidden
                    />
                    <span className="flex-1 truncate">{w.name}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {count}
                    </span>
                  </button>
                )}
                {editingId !== w.id && (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
                      aria-label={`Rename ${w.name}`}
                      onClick={() => startRename(w.id, w.name)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label={`Delete ${w.name}`}
                      disabled={workspaces.length <= 1}
                      onClick={() => setDeleteTarget(w.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5 pt-1">
          <Input
            value={newName}
            placeholder="New workspace…"
            className="h-8"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submitNew();
            }}
            aria-label="New workspace name"
          />
          <Button
            size="icon"
            variant="ghost"
            className="size-8 shrink-0"
            aria-label="Create workspace"
            onClick={() => void submitNew()}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </DialogContent>
      <DeleteWorkspaceDialog workspaceId={deleteTarget} onClose={() => setDeleteTarget(null)} />
    </Dialog>
  );
}
