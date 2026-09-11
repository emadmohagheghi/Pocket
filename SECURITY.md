# Security Policy

## Supported versions

Pocket is currently in early development. Security fixes are provided for the
latest release only.

| Version | Supported |
| --- | --- |
| Latest release | Yes |
| Older releases | No |

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting feature from the repository's
Security tab. Include the affected version, reproduction steps, expected impact,
and any suggested mitigation.

Do not publish exploitable details in a public issue. If private vulnerability
reporting is temporarily unavailable, open a public issue containing no sensitive
details and ask the maintainer for a private contact channel.

The maintainer will acknowledge a report when it is received, investigate it,
and publish a coordinated fix and advisory when appropriate. Response times are
best-effort while the project is maintained by a small team.

## Release integrity

Official releases are produced by the repository's GitHub Actions workflow from
version tags. The project is preparing to use SignPath Foundation for Windows
code signing. Until that integration is active, release artifacts are unsigned
and may show an unknown-publisher warning.

See [CODE_SIGNING_POLICY.md](CODE_SIGNING_POLICY.md) for the signing and release
policy.

