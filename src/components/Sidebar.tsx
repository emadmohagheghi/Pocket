import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  AudioLines,
  FolderOpen,
  Inbox,
  Link2,
  NotebookText,
  Settings as SettingsIcon,
  Sparkles,
  SquareCheck,
  Terminal,
} from "lucide-react";

import { usePocket } from "@/store";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Section } from "@/types";

const NAV: { id: Section; label: string; icon: typeof Inbox }[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "prompts", label: "Prompts", icon: Terminal },
  { id: "notes", label: "Notes", icon: NotebookText },
  { id: "links", label: "Links", icon: Link2 },
  { id: "tasks", label: "Tasks", icon: SquareCheck },
  { id: "voice", label: "Voice", icon: AudioLines },
];

interface SidebarProps {
  onOpenSettings: () => void;
}

export function Sidebar({ onOpenSettings }: SidebarProps) {
  const { view, setView, settings, workspaces, gaming } = usePocket();
  const active = workspaces.find((w) => w.id === settings?.activeWorkspaceId);
  const [gamingBadge, setGamingBadge] = useState(false);

  useEffect(() => {
    const p = listen<boolean>("gaming-mode-changed", (e) => setGamingBadge(e.payload));
    void api.getGamingState().then(setGamingBadge).catch(() => {});
    return () => {
      void p.then((f) => f());
    };
  }, []);

  const counts = (id: Section): number | undefined => {
    if (!active) return undefined;
    switch (id) {
      case "prompts":
        return active.counts.prompts;
      case "notes":
        return active.counts.notes;
      case "links":
        return active.counts.links;
      case "tasks":
        return active.counts.tasks;
      case "voice":
        return active.counts.recordings;
      default:
        return undefined;
    }
  };

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-4 pb-1 pt-4">
        <div className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Sparkles className="size-4" />
        </div>
        <div>
          <div className="text-sm font-semibold leading-none">Pocket</div>
          <div className="text-[11px] text-muted-foreground">local-first companion</div>
        </div>
      </div>

      <div className="px-3 pb-2 pt-3">
        <WorkspaceSwitcher />
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3 py-2">
        {NAV.map(({ id, label, icon: Icon }) => {
          const count = counts(id);
          return (
            <button
              key={id}
              onClick={() => setView(id)}
              aria-current={view === id}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                "hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-ring",
                view === id && "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
              )}
            >
              <Icon className="size-4 text-muted-foreground" />
              <span className="flex-1 text-left">{label}</span>
              {count !== undefined && count > 0 && (
                <span className="text-[11px] tabular-nums text-muted-foreground">{count}</span>
              )}
            </button>
          );
        })}
      </nav>

      {(gaming || gamingBadge) && (
        <div className="mx-3 mb-2 rounded-md bg-orange-500/10 px-2.5 py-1.5 text-[11px] leading-tight text-orange-600 dark:text-orange-400">
          <div className="font-medium">Gaming mode active</div>
          <div className="opacity-80">Global shortcuts are disabled.</div>
        </div>
      )}

      <div className="border-t p-3">
        <button
          onClick={onOpenSettings}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
            "hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-ring",
            view === "settings" && "bg-sidebar-accent font-medium"
          )}
        >
          <SettingsIcon className="size-4 text-muted-foreground" />
          Settings
        </button>
        <button
          onClick={() => void api.openDataFolder().catch(() => {})}
          className={cn(
            "mt-0.5 flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
            "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-2 focus-visible:outline-ring"
          )}
        >
          <FolderOpen className="size-4" />
          Open data folder
        </button>
      </div>
    </aside>
  );
}
