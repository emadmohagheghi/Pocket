import { useEffect, useState } from "react";
import { toast } from "sonner";

import { usePocket } from "@/store";
import { Sidebar } from "@/components/Sidebar";
import { ItemList } from "@/components/ItemList";
import { VoiceList } from "@/components/VoiceList";
import { SettingsView } from "@/components/SettingsView";
import { SearchOverlay } from "@/components/SearchOverlay";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";

function applyTheme(theme: string) {
  const root = document.documentElement;
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
}

export default function MainWindow() {
  const { init, settings, view, gaming, setView } = usePocket();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (settings) applyTheme(settings.theme);
  }, [settings?.theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      if (e.ctrlKey || e.metaKey) {
        void api.log(`main keydown key=${e.key} ctrl=${e.ctrlKey} typing=${typing}`);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        void api.log("Ctrl+K handler fired -> opening search overlay");
        setSearchOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        void api.log("Ctrl+N handler fired -> invoking open_capture");
        void api
          .openCapture("text")
          .then(() => api.log("open_capture resolved"))
          .catch((err) => {
            void api.log(`open_capture FAILED: ${err}`);
            toast.error(String(err));
          });
      } else if (e.key === "Escape" && !typing) {
        setSearchOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar onOpenSettings={() => setView("settings")} />
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b px-5 py-2.5">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold tracking-tight capitalize">
              {view === "settings" ? "Settings" : view}
            </h1>
            {gaming && (
              <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[11px] font-medium text-orange-600 dark:text-orange-400">
                Gaming mode — shortcuts off
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Search</span>
            <Kbd>Ctrl K</Kbd>
            <span className="mx-1">·</span>
            <span>Capture</span>
            <Kbd>Ctrl N</Kbd>
            <Button
              size="sm"
              className="ml-2 h-7 gap-1 px-2.5 text-xs"
              onClick={() => void api.openCapture("text").catch((err) => toast.error(String(err)))}
            >
              <Plus className="size-3.5" /> Capture
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {view === "voice" ? (
            <VoiceList />
          ) : view === "settings" ? (
            <SettingsView />
          ) : (
            <ItemList view={view} />
          )}
        </div>
      </main>

      <SearchOverlay open={searchOpen} onOpenChange={setSearchOpen} />
      {settings === null && (
        <div className="fixed inset-0 grid place-items-center bg-background/80">
          <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
            Loading Pocket…
          </div>
        </div>
      )}
    </div>
  );
}
