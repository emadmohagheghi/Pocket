import { useState } from "react";
import { Check, ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { usePocket } from "@/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteWorkspaceDialog } from "@/components/DeleteWorkspaceDialog";
import { cn } from "@/lib/utils";

export function WorkspaceSwitcher() {
  const { settings, workspaces, setActiveWorkspace, createWorkspace, renameWorkspace } =
    usePocket();
  const active = workspaces.find((w) => w.id === settings?.activeWorkspaceId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const submitNew = async () => {
    const name = newName.trim();
    if (!name) return;
    const ws = await createWorkspace(name);
    if (ws) {
      setNewName("");
      setAdding(false);
      await setActiveWorkspace(ws.id);
    }
  };

  const submitRename = async () => {
    if (!active) return;
    const name = renameValue.trim();
    if (!name || name === active.name) {
      setRenaming(false);
      return;
    }
    await renameWorkspace(active.id, name);
    setRenaming(false);
    toast.success("Workspace renamed");
  };

  return (
    <>
      {adding || renaming ? (
        <div className="flex items-center gap-1">
          <Input
            autoFocus
            value={adding ? newName : renameValue}
            placeholder={adding ? "Workspace name" : undefined}
            className="h-8"
            onChange={(e) => (adding ? setNewName(e.target.value) : setRenameValue(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter") void (adding ? submitNew() : submitRename());
              if (e.key === "Escape") {
                setAdding(false);
                setRenaming(false);
              }
            }}
            onBlur={() => void (adding ? submitNew() : submitRename())}
          />
          <Button
            size="icon"
            variant="ghost"
            className="size-8 shrink-0"
            aria-label="Confirm"
            onClick={() => void (adding ? submitNew() : submitRename())}
          >
            <Check className="size-4" />
          </Button>
        </div>
      ) : (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-between px-3 font-semibold"
              aria-label={`Active workspace: ${active?.name ?? "—"}`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="size-2 shrink-0 rounded-full bg-emerald-500" />
                <span className="truncate">{active?.name ?? "No workspace"}</span>
              </span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {workspaces.map((w) => (
              <DropdownMenuItem
                key={w.id}
                onClick={() => void setActiveWorkspace(w.id)}
                className="gap-2"
              >
                <Check
                  className={cn(
                    "size-3.5",
                    w.id === active?.id ? "opacity-100" : "opacity-0"
                  )}
                />
                <span className="flex-1 truncate">{w.name}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                setMenuOpen(false);
                setAdding(true);
              }}
            >
              <Plus className="size-4" /> New workspace
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!active}
              onClick={() => {
                setMenuOpen(false);
                setRenameValue(active?.name ?? "");
                setRenaming(true);
              }}
            >
              <Pencil className="size-4" /> Rename workspace
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!active || workspaces.length <= 1}
              variant="destructive"
              onClick={() => {
                setMenuOpen(false);
                setDeleteTarget(active?.id ?? null);
              }}
            >
              <Trash2 className="size-4" /> Delete workspace…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <DeleteWorkspaceDialog
        workspaceId={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}
