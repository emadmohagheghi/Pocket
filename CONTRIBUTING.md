# Contributing to Pocket

Thank you for helping improve Pocket.

## Before opening a change

- Keep Pocket local-first and avoid adding telemetry or an account requirement.
- Explain any new network access, background behavior, permission, or persisted
  data in the pull request and update `PRIVACY.md` when appropriate.
- Never commit credentials, signing keys, recordings, captured notes, or other
  user data.
- Keep Windows capture gestures responsive and avoid blocking work inside the
  low-level keyboard hook.

## Development setup

Pocket currently targets Windows x64.

```powershell
pnpm install
pnpm tauri dev
```

Before submitting a pull request, run:

```powershell
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
```

Use focused commits with imperative messages. Update documentation and tests
with behavioral changes. Pull requests from non-maintainers require maintainer
review before merging.

## Security-sensitive changes

Changes to global keyboard handling, clipboard access, microphone capture, file
storage, import/export, Tauri capabilities, dependencies, GitHub Actions, or code
signing should explain their security impact explicitly. Vulnerabilities should
be reported privately according to `SECURITY.md`, not through a normal pull
request or public issue.

