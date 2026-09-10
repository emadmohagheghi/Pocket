import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  FolderOpen,
  Layers,
  MoreHorizontal,
  Settings as SettingsIcon,
  X,
} from "lucide-react";

import { usePocket } from "@/store";
import { AddBar, ItemList } from "@/components/ItemList";
import { PlayerBar } from "@/components/VoiceList";
import { SettingsDialog } from "@/components/SettingsView";
import { WorkspacesDialog } from "@/components/WorkspaceSwitcher";
import { SearchBar } from "@/components/SearchBar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { applyTheme } from "@/lib/theme";

export default function MainWindow() {
  const { init, settings, gaming } = usePocket();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workspacesOpen, setWorkspacesOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void init()
      .then(() => api.frontendReady())
      .catch((err) => toast.error(String(err)));
  }, [init]);

  useEffect(() => {
    if (settings) applyTheme(settings.theme);
  }, [settings?.theme]);

  // Frameless transparent window: the card below provides the background.
  useEffect(() => {
    document.body.style.background = "transparent";
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      if (e.ctrlKey && !e.altKey && !e.shiftKey && (e.key === "n" || e.key === "N")) {
        // Ctrl+N — open the quick-capture bar (global shortcut while focused here).
        e.preventDefault();
        void api.openCapture("text").catch((err) => toast.error(String(err)));
      } else if (e.ctrlKey && !e.altKey && !e.shiftKey && (e.key === "k" || e.key === "K")) {
        // Ctrl+K — focus the persistent search field.
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (e.key === "Escape" && !typing) {
        setSettingsOpen(false);
        setWorkspacesOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative h-screen bg-transparent p-3">
      <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-border/60 bg-background">
        {/* Dedicated full-width drag strip: the search/menu row below is
            almost entirely interactive, so without this there would be no
            usable empty area to grab the frameless window by. */}
        <div data-tauri-drag-region className="h-5 w-full shrink-0" aria-hidden />
        {/* Top bar: search + overflow menu. */}
        <div className="flex items-center gap-2 px-3 pb-0">
          <SearchBar inputRef={searchInputRef} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="More options"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setWorkspacesOpen(true)}>
                  <Layers /> Workspaces
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                  <SettingsIcon /> Settings
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  className="whitespace-nowrap"
                  onClick={() =>
                    void api.openDataFolder().catch((err) => toast.error(String(err)))
                  }
                >
                  <FolderOpen /> Open data folder
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onClick={() =>
                    void api.closeWindow().catch((err) => toast.error(String(err)))
                  }
                >
                  <X /> Close Window
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Gaming-mode banner. */}
        {gaming && (
          <div className="px-3 pt-2">
            <div className="rounded-xl bg-orange-500/10 px-3 py-2 text-[11px] leading-snug text-orange-600 dark:text-orange-400">
              <span className="font-medium">Gaming mode active</span> — quick capture is
              disabled.
            </div>
          </div>
        )}

        {/* Unified feed. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2 pt-1">
          <ItemList />
        </div>

        {/* Voice player (only while something plays) + pinned capture bar. */}
        <PlayerBar />
        <div className="shrink-0 border-t border-border/60 px-4 pb-4 pt-3">
          <AddBar />
        </div>
      </div>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <WorkspacesDialog open={workspacesOpen} onClose={() => setWorkspacesOpen(false)} />
    </div>
  );
}
