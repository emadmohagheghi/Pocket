# SignPath Foundation setup

This document tracks the remaining maintainer actions for enabling free Windows
code signing through SignPath Foundation. Do not add credentials or API tokens
to this file.

## Repository preparation completed in source

- MIT license
- Privacy policy
- Security policy and private-reporting instructions
- Code signing policy with maintainer roles
- CODEOWNERS protection intent for release-sensitive paths
- Windows CI for frontend builds and Rust tests
- Release documentation that distinguishes unsigned and signed artifacts

## Actions required before applying

1. Make the repository public.
2. Enable multi-factor authentication for every maintainer.
3. Enable GitHub private vulnerability reporting.
4. Add branch protection or a ruleset for `master` that requires the CI job.
5. Confirm the public repository description, topics, and Releases page explain
   what Pocket does.
6. Review the current SignPath Foundation terms and submit the application at
   <https://signpath.org/apply.html>.

## Actions required after approval

SignPath will provide an organization ID, project slug, signing policy slug, and
API token. Store the token only as a GitHub Actions secret named
`SIGNPATH_API_TOKEN`. The other identifiers may be stored as GitHub variables.

Then update the release workflow to:

1. Build unsigned Windows artifacts on a GitHub-hosted runner.
2. Upload the unsigned artifact with `actions/upload-artifact`.
3. Submit its artifact ID using
   `signpath/github-action-submit-signing-request`.
4. Wait for manual approval and signing completion.
5. Publish only the signed output to GitHub Releases.
6. Fail the release if signing is rejected or unavailable; never silently
   publish an unsigned file as signed.

The exact SignPath workflow cannot be committed safely before those identifiers
and the approved artifact configuration exist.

