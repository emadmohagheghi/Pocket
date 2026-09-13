import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowBigUp,
  FolderOpen,
  Layers,
  MoreHorizontal,
  Pin,
  Settings as SettingsIcon,
  X,
} from "lucide-react";

import { usePocket } from "@/store";
import { AddBar, ItemList } from "@/components/ItemList";
import { VoicePlayerEngine } from "@/components/VoiceList";
import { SettingsDialog } from "@/components/SettingsView";
import { WorkspacesDialog } from "@/components/WorkspaceSwitcher";
import { SearchBar } from "@/components/SearchBar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { listen } from "@tauri-apps/api/event";
import { Toaster } from "@/components/ui/toast";
import { applyTheme } from "@/lib/theme";
import { playPocketSound, unlockPocketAudio } from "@/lib/sound";

export default function MainWindow() {
  // Field selectors: keeps this window (and everything subscribed below it)
  // from re-rendering on unrelated store changes like player progress.
  const init = usePocket((s) => s.init);
  const settings = usePocket((s) => s.settings);
  const gaming = usePocket((s) => s.gaming);
  const setSettings = usePocket((s) => s.setSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workspacesOpen, setWorkspacesOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const alwaysOnTop = settings?.alwaysOnTop ?? false;

  // Overflow-menu actions, shared between the menu items and their
  // app-focused keyboard shortcuts (Ctrl+Shift+T/W/O/Q, Ctrl+, and
  // Ctrl+Shift+S for settings).
  const toggleStayOnTop = useCallback(() => {
    void setSettings({ alwaysOnTop: !alwaysOnTop }).catch(() => {});
  }, [alwaysOnTop, setSettings]);
  const openWorkspaces = useCallback(() => {
    playPocketSound("open");
    setWorkspacesOpen(true);
  }, []);
  const openSettings = useCallback(() => {
    playPocketSound("open");
    setSettingsOpen(true);
  }, []);
  const openDataFolder = useCallback(() => {
    void api.openDataFolder().catch(() => {});
  }, []);
  const closeWindow = useCallback(() => {
    void api.closeWindow().catch(() => {});
  }, []);

  // "Ctrl+Shift+" prefix rendered with the ⇧ keycap glyph.
  const modPrefix = (
    <>
      Ctrl
      <ArrowBigUp className="mx-0.5 inline size-3.5 text-muted-foreground" />
    </>
  );

  useEffect(() => {
    void init()
      .then(() => api.frontendReady())
      .catch(() => {});
  }, [init]);

  useEffect(() => {
    if (settings) applyTheme(settings.theme);
  }, [settings?.theme]);

  // Frameless transparent window: the card below provides the background.
  useEffect(() => {
    document.body.style.background = "transparent";
  }, []);

  // Keep the shared AudioContext armed so hotkey-triggered cues (record
  // start/stop from a Shift+Shift hold while Pocket was unfocused) sound.
  useEffect(() => {
    void unlockPocketAudio();
    const arm = () => void unlockPocketAudio();
    window.addEventListener("focus", arm);
    window.addEventListener("pointerdown", arm);
    window.addEventListener("keydown", arm);
    return () => {
      window.removeEventListener("focus", arm);
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
    };
  }, []);

  // Double-shift hold (native hook) drives the in-app recorder: bridge the
  // backend events onto window events the AddBar listens for.
  useEffect(() => {
    const unlisten = [
      listen("voice-hold-start", () =>
        window.dispatchEvent(new Event("pocket-voice-hold-start"))
      ),
      listen("voice-hold-release", () =>
        window.dispatchEvent(new Event("pocket-voice-hold-stop"))
      ),
    ];
    return () => {
      void Promise.all(unlisten).then((uns) => uns.forEach((u) => u()));
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      if (e.ctrlKey && !e.altKey && !e.shiftKey && (e.key === "k" || e.key === "K")) {
        // Ctrl+K — focus the persistent search field.
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === "," || e.code === "Comma")) {
        // Ctrl+, — Settings (VS Code convention).
        e.preventDefault();
        openSettings();
      } else if (e.ctrlKey && e.shiftKey && !e.altKey) {
        // Overflow-menu shortcuts — same actions as the three-dot items,
        // available whenever the app window itself has keyboard focus.
        const key = e.key.toLowerCase();
        if (key === "t") {
          e.preventDefault();
          toggleStayOnTop();
        } else if (key === "w") {
          e.preventDefault();
          openWorkspaces();
        } else if (key === "s") {
          e.preventDefault();
          openSettings();
        } else if (key === "o") {
          e.preventDefault();
          openDataFolder();
        } else if (key === "q") {
          e.preventDefault();
          closeWindow();
        }
      } else if (e.key === "Escape" && !typing) {
        setSettingsOpen(false);
        setWorkspacesOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleStayOnTop, openWorkspaces, openSettings, openDataFolder, closeWindow]);

  return (
    <div className="relative h-screen bg-transparent p-3">
      <div className="flex h-full flex-col overflow-hidden rounded-[36px] border border-border/60 bg-background">
        {/* Dedicated drag strips: the window is only draggable from these
            empty areas, never from content. */}
        <div data-tauri-drag-region className="h-3 w-full shrink-0" aria-hidden />
        {/* Top bar: search + overflow menu. */}
        <div className="flex items-center gap-2 px-3 pb-0">
          <SearchBar inputRef={searchInputRef} />
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="size-10 shrink-0 rounded-[24px] border border-border/60 bg-card text-muted-foreground hover:bg-card! hover:text-muted-foreground active:bg-card! aria-expanded:bg-card! aria-expanded:text-muted-foreground!"
                aria-label="More options"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuCheckboxItem
                  checked={alwaysOnTop}
                  onCheckedChange={(checked) =>
                    void setSettings({ alwaysOnTop: checked === true }).catch(() => {})
                  }
                >
                  <Pin /> Stay on top
                  <DropdownMenuShortcut>{modPrefix}+T</DropdownMenuShortcut>
                </DropdownMenuCheckboxItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onClick={openWorkspaces}
                >
                  <Layers /> Workspaces
                  <DropdownMenuShortcut>{modPrefix}+W</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={openSettings}
                >
                  <SettingsIcon /> Settings
                  <DropdownMenuShortcut>Ctrl+,</DropdownMenuShortcut>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  className="whitespace-nowrap"
                  onClick={openDataFolder}
                >
                  <FolderOpen /> Open data folder
                  <DropdownMenuShortcut>{modPrefix}+O</DropdownMenuShortcut>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  className="whitespace-nowrap"
                  onClick={closeWindow}
                >
                  <X /> Close Window
                  <DropdownMenuShortcut>{modPrefix}+Q</DropdownMenuShortcut>
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

        {/* Unified feed (MessageScroller handles scrolling/auto-scroll). */}
        <div className="min-h-0 flex-1">
          <ItemList />
        </div>

        {/* Invisible audio engine; playback UI lives in the voice rows. */}
        <VoicePlayerEngine />
        <div className="shrink-0 px-3 pb-0 pt-3">
          <AddBar />
          <div data-tauri-drag-region className="h-3 w-full" aria-hidden />
        </div>
      </div>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <WorkspacesDialog open={workspacesOpen} onClose={() => setWorkspacesOpen(false)} />
      <Toaster />
    </div>
  );
}
