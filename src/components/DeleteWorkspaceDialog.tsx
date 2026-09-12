import { useEffect, useState } from "react";

import { usePocket } from "@/store";
import { api } from "@/lib/api";
import { playPocketSound } from "@/lib/sound";
import type { Counts } from "@/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const LABELS: Record<keyof Counts, string> = {
  texts: "text items",
  recordings: "voice recordings",
};

interface Props {
  /** Id of the workspace pending deletion, or null when closed. */
  workspaceId: string | null;
  onClose: () => void;
}

export function DeleteWorkspaceDialog({ workspaceId, onClose }: Props) {
  const { workspaces, deleteWorkspace, settings } = usePocket();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [busy, setBusy] = useState(false);

  const workspace = workspaces.find((w) => w.id === workspaceId);

  useEffect(() => {
    if (!workspaceId) {
      setCounts(null);
      return;
    }
    void api
      .getWorkspaceCounts(workspaceId)
      .then(setCounts)
      .catch(() => setCounts(null));
  }, [workspaceId]);

  const rows = counts
    ? (Object.entries(counts) as [keyof Counts, number][])
        .filter(([, n]) => n > 0)
        .map(([kind, n]) => `${n} ${LABELS[kind]}`)
    : [];

  const confirm = async () => {
    if (!workspaceId) return;
    setBusy(true);
    await deleteWorkspace(workspaceId);
    playPocketSound("destructive");
    setBusy(false);
    onClose();
  };

  return (
    <AlertDialog open={workspaceId !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent data-tauri-drag-region="deep">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{workspace?.name}”?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>This workspace contains:</p>
              {rows.length > 0 ? (
                <ul className="rounded-md border bg-muted/40 px-3 py-2 text-foreground">
                  {rows.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              ) : counts ? (
                <p className="rounded-md border bg-muted/40 px-3 py-2 text-foreground">
                  This workspace is empty.
                </p>
              ) : (
                <p className="text-muted-foreground">Could not load workspace contents.</p>
              )}
              <p>All of this data — including voice files on disk — will be permanently deleted.</p>
              {workspaceId === settings?.activeWorkspaceId && (
                <p className="text-xs text-muted-foreground">
                  Captures will switch to another workspace afterwards.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              void confirm();
            }}
          >
            {busy ? "Deleting…" : "Delete Workspace"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
