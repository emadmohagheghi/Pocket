# Pocket

A lightweight, privacy-first desktop companion for people who work with AI tools.
Capture text, links, prompts, tasks, and voice notes from anywhere — without
leaving your workflow.

Built with **Rust + Tauri v2 + React + TypeScript + shadcn/ui + Tailwind CSS**.

## Highlights

- **Quick capture everywhere** — press **Shift twice** (default, configurable) or
  `Ctrl+N` to open a compact capture bar. Type, hit Enter, done.
- **Workspaces** — every note, prompt, task, link, and recording belongs to the
  active workspace. Switch context with one click.
- **Prompt queue** — queue prompts for your AI tools, copy with one click, mark
  sent, reorder.
- **Voice notes** — record from the capture bar or tray. Audio (opus/webm) is
  stored locally and never uploaded anywhere.
- **System tray** — Pocket lives in the tray: quick capture, voice recording,
  workspace switching, settings, quit.
- **Gaming mode** — a Rust-side detector watches the foreground window; when a
  fullscreen/borderless game is detected, **all global shortcuts are disabled**
  until you leave the game.
- **Local-first storage** — no account, no cloud, no telemetry. Data lives in a
  `PocketData` folder next to the executable (falls back to the per-user app
  config directory when the install folder is not writable). All writes are
  atomic (temp file + rename).

## Keyboard shortcuts

| Action | Default |
| --- | --- |
| Quick capture (global) | Double Shift |
| Quick capture (in main window) | `Ctrl+N` |
| Search workspace | `Ctrl+K` |
| Save capture | `Enter` |
| Newline in capture | `Shift+Enter` |
| Switch capture type | `Alt+1..5` |
| Close capture | `Esc` |
| Copy focused item | `C` |
| Complete focused task/prompt | `X` |
| Edit focused item | `E` |
| Delete focused item | `Del` |

All shortcuts are configurable in Settings → Shortcuts.

## Development

```bash
npm install
npm run tauri dev     # run the app in development
npm run tauri build   # produce release bundles
cargo test            # Rust unit tests (in src-tauri)
```

## Data layout

```
PocketData/
  settings.json                  # app settings
  workspaces.json                # workspace index
  workspaces/<id>/workspace.json # items + recordings metadata
  voices/<id>/<recording>.webm   # voice recordings
```

Voice playback is served through a sandboxed `voice://` protocol that only ever
exposes files registered in a workspace's metadata — no arbitrary filesystem
access from the webview.
