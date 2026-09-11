# Pocket

Pocket is a lightweight, privacy-first Windows companion for capturing selected
text and voice notes without leaving your current workflow.

It is built with Rust, Tauri v2, React, TypeScript, shadcn/ui, and Tailwind CSS.
Pocket is currently in early development and its release builds target Windows
x64.

## Features

- Capture selected text from any application with a double press of Left Shift.
- Record voice notes from the main window, quick-capture panel, or system tray.
- Use Right Shift as push-to-record: double press, hold to record, and release to
  save.
- Organize text and recordings into independent workspaces.
- Search the active workspace as you type.
- Pin important text and voice notes.
- Export and import complete backup archives, including audio files.
- Keep all application data local, with no account, cloud service, telemetry, or
  advertising.

## Privacy-sensitive behavior

Pocket uses a Windows low-level keyboard hook to recognize the Left Shift and
Right Shift capture gestures. Key contents are not logged, stored, or sent over
the network. The hook only keeps the timing and side of Shift presses and
whether another key interrupted the gesture.

When the Left Shift text-capture gesture is used, Pocket temporarily uses the
Windows clipboard to copy the text currently selected in the foreground
application. This action replaces the clipboard's previous contents. The
captured text is saved locally only when the selection is non-empty.

Microphone access is used only for a recording explicitly started by the user.
Voice recordings remain on the local machine unless the user chooses to export
a backup.

See the full [Privacy Policy](PRIVACY.md) and [Security Policy](SECURITY.md).

## Keyboard controls

| Action | Default control |
| --- | --- |
| Capture selected text | Double press Left Shift |
| Open voice capture | Double press Left Shift and hold the second press |
| Push-to-record voice | Double press Right Shift, hold, then release to save |
| Focus search | `Ctrl+K` |
| Save text from the main add bar | `Enter` |
| Cancel the voice-capture panel | `Esc` |

## Installation

Official Windows installers are published on the GitHub Releases page. Pocket
currently produces an NSIS `.exe` installer for the current user and an `.msi`
installer that may require administrator access.

Release artifacts are currently unsigned while the project prepares its
application to SignPath Foundation. Windows SmartScreen may therefore display
an unknown-publisher warning. Never download Pocket installers from an
unofficial source.

## Local data

Pocket first attempts to create a `PocketData` directory next to the executable.
If that location is not writable, it uses the per-user application configuration
directory instead. The exact active location is shown in Settings.

```text
PocketData/
  settings.json
  workspaces.json
  workspaces/<id>/workspace.json
  voices/<id>/<recording>.webm
```

Writes to Pocket's JSON data files are atomic. Voice playback uses a restricted
local protocol that only exposes recordings registered in workspace metadata.

## Development

Requirements:

- Windows 10 or Windows 11 x64
- Node.js and npm
- Rust stable with the MSVC toolchain
- Microsoft Edge WebView2 Runtime

```powershell
npm install
npm run tauri dev
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a change.

## Code signing policy

Pocket is preparing to use SignPath Foundation for verifiable Windows release
signing. The complete policy, maintainer roles, and release guarantees are in
[CODE_SIGNING_POLICY.md](CODE_SIGNING_POLICY.md).

Free code signing provided by SignPath.io, certificate by SignPath Foundation.

Until the SignPath application is approved and the release workflow is updated,
official artifacts must be treated as unsigned.

## License

Pocket is licensed under the [MIT License](LICENSE).
