# Privacy Policy

Last updated: September 11, 2026

Pocket is a local-first application. It does not require an account and does
not include analytics, advertising, tracking, or telemetry.

This program will not transfer any information to other networked systems
unless specifically requested by the user or the person installing or
operating it.

## Data Pocket processes

Pocket may process the following data on the user's device:

- Text explicitly entered into Pocket or captured from a foreground selection.
- Voice recordings explicitly started by the user, including their duration,
  size, name, and creation time.
- Workspace metadata, application settings, and item timestamps.
- Local diagnostic information such as timestamps, operation results, and crash
  messages. Diagnostic logs do not intentionally contain captured note text,
  voice audio, or the contents of non-Shift keystrokes.

## Storage

Text, settings, workspace metadata, and voice recordings are stored on the
local device. Pocket attempts to use a `PocketData` directory next to its
executable and falls back to the per-user application configuration directory
when the first location is not writable. The current location can be viewed and
opened from Settings.

Pocket does not automatically upload or synchronize this data. Export creates a
backup archive only after the user selects a destination. Import reads only the
backup archive selected by the user.

Uninstalling Pocket may not remove the user's data directory. This protects
notes from accidental loss. Users can open the data directory from Settings and
remove it manually after making any desired backup.

## Keyboard gesture processing

Pocket installs a Windows low-level keyboard hook while it is running so it can
recognize double-Shift capture gestures globally. It observes keyboard events in
memory, but only retains the timing and side of Shift presses and whether another
key interrupted the gesture. It does not create a history of typed keys and does
not transmit keyboard activity.

For the Left Shift text-capture gesture, Pocket clears the Windows clipboard,
sends a standard copy command to the foreground application, and reads the
resulting selected text. This replaces the clipboard's previous contents. A
non-empty selection is stored as a local note; otherwise nothing is saved.

## Microphone

Pocket requests microphone access for its own application windows. Audio capture
begins only after an explicit recording action. Recordings are stored locally and
are not uploaded by Pocket.

## Network activity

The installed application does not contact a Pocket server. Network activity may
occur outside the application in these user-directed or installation scenarios:

- Opening a saved HTTP or HTTPS link launches the system's default browser.
- The installer may download Microsoft Edge WebView2 Runtime from Microsoft when
  the runtime is not already installed.
- Downloading Pocket, viewing its repository, or reporting an issue uses GitHub
  under GitHub's own privacy terms.

If an automatic updater or another networked feature is introduced later, this
policy will be updated before that feature is released.

## User control

Users can view their storage location, export a complete backup, import a backup,
delete individual items or recordings, and manually delete the local data
directory. Pocket includes no remote account or server-side copy to delete.

## Changes

Material privacy changes will be documented in this file and in the relevant
release notes.

