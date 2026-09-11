# Code Signing Policy

## Service

Free code signing provided by SignPath.io, certificate by SignPath Foundation.

Pocket is applying for the SignPath Foundation open-source code-signing program.
Once approved, official Windows release artifacts will be signed through
SignPath.io using a certificate issued to SignPath Foundation. The signing key
will remain protected by SignPath and will not be stored in this repository or
in GitHub Actions secrets.

Until the integration is activated, Pocket's release artifacts are unsigned and
must not be represented as SignPath-signed.

## Project and release scope

- Repository: <https://github.com/emadmohagheghi/Pocket>
- Official downloads: <https://github.com/emadmohagheghi/Pocket/releases>
- Signed scope: Windows executables and installers built from this repository.
- Build system: GitHub Actions using GitHub-hosted Windows runners.
- Source of releases: version tags whose version matches the application
  manifests.

Only artifacts produced from Pocket's own source and automated build workflow
may be submitted for signing. Third-party dependencies are built or bundled
under their respective licenses and are not represented as Pocket-authored
software.

## Team roles

- Committer and reviewer: [@emadmohagheghi](https://github.com/emadmohagheghi)
- Signing approver: [@emadmohagheghi](https://github.com/emadmohagheghi)

All maintainers with repository or SignPath access must use multi-factor
authentication. Contributions from non-maintainers require maintainer review
before merging. Changes to build, release, and signing policy files receive the
same review as application code.

## Release process

1. Changes are committed to the default branch through the documented
   contribution process.
2. Frontend builds and Rust tests must pass in GitHub Actions.
3. Application versions are kept consistent across the JavaScript, Rust, and
   Tauri manifests.
4. A version tag triggers a clean build on a GitHub-hosted Windows runner.
5. After SignPath approval and integration, the unsigned build artifact is sent
   directly from GitHub Actions to SignPath.io.
6. A designated approver reviews each signing request.
7. Only the resulting signed artifacts are attached to the official release.

Release notes must clearly state whether artifacts are signed. Failed, rejected,
or unverifiable signing requests must never fall back to publishing an artifact
that is described as signed.

## Privacy and security

Pocket's [Privacy Policy](PRIVACY.md) describes its local data handling,
keyboard-gesture detection, clipboard use, microphone access, and network
behavior. Security issues should be reported according to
[SECURITY.md](SECURITY.md).

SignPath Foundation may suspend signing access or revoke signatures if the
project violates its program conditions. The project will cooperate with valid
security reports and signing-integrity investigations.

