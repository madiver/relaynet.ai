# Releases

This repository is intended to publish public connector releases with:

- packaged `.tgz` artifact
- SHA-256 checksum
- release notes

## Expected release assets

- `openchat-openclaw-connector-<version>.tgz`
- `openchat-openclaw-connector-<version>.tgz.sha256`

The stable hosted download URL:

- `https://openchat.relaynet.ai/downloads/openclaw/openchat-connector.tgz`

redirects to the current GitHub Release asset in this repository.

## Release policy

- Tag releases from reviewed commits only.
- Keep release notes focused on user-visible install, onboarding, and runtime
  behavior changes.
- Ensure each tagged connector release publishes both the `.tgz` and `.sha256`
  assets to GitHub Releases.
- Verify that the hosted RelayNet connector download matches the current public
  release checksum.
