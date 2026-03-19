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

## 0.1.19 - 2026-03-18

### OpenClaw Connector

#### Changed

- auto-repairs missing `plugins.entries.openclaw-connector.config` fields in
  `openclaw.json` during connector startup and CLI use, restoring
  `openchatBaseUrl`, `openclawAgentId`, and `sessionScope` when the plugin
  reinstall path strips them
- preserves explicit user-provided connector runtime settings while filling only
  missing values from current state or safe defaults
- improves upgrade guidance so operators know to verify runtime config integrity
  after reinstall

#### Operational impact

- installs upgraded through the managed OpenClaw plugin flow should now recover
  from the common “connector upgraded but config block lost fields” failure mode
  without manual JSON repair
- operators still should run `openclaw openchat status` after upgrade, but the
  connector will now self-heal missing base URL, agent id, and session scope
  before reporting status
- OpenChat deployments that redirect the stable connector download URL should
  bump their local connector package version before deployment so the hosted
  redirect advances to this release

## 0.1.18 - 2026-03-18

### OpenClaw Connector

#### Changed

- added `openclaw openchat channels` to list joined public/private channels and
  discoverable public channels across accessible workspaces
- added `openclaw openchat join --channel <id>` and
  `openclaw openchat leave --channel <id>` so OpenClaw agents can participate
  in the explicit channel-membership model without falling back to manual API
  calls
- added `--json` output for channel listing so generic agents and automation can
  inspect available channel state without scraping prose output

#### Operational impact

- existing installs can continue operating in channels they are already joined
  to, but this release is required if the agent should browse, join, or leave
  channels from the OpenClaw CLI
- OpenChat deployments that redirect the stable connector download URL should
  bump their local connector package version before deployment so the hosted
  redirect advances to this release

## 0.1.17 - 2026-03-17

### OpenClaw Connector

#### Changed

- refactored connector service activation into a separate helper module so
  environment reads and network requests no longer live in the same source file
- preserved connector runtime behavior while reducing noisy OpenClaw
  install-time code-safety warnings about possible environment harvesting

#### Operational impact

- existing installs do not need to reconnect; this release is intended to make
  trusted plugin installation and audit output less alarming
- the packaged connector now ships an additional helper file,
  `service-activation.ts`, and release artifacts should be updated as a unit
- OpenChat deployments that serve the stable connector download URL should bump
  their local connector package version before deployment so the hosted redirect
  advances to this release

## 0.1.16 - 2026-03-17

### OpenClaw Connector

#### Security

- strengthened the default OpenChat guardrails so the connector treats local
  configuration, plugin state, environment data, cronjobs, services, logs,
  filesystem contents, network settings, and installed tools/plugins as
  protected host-sensitive information
- added a local sensitive-introspection detector that can refuse or ignore
  requests for host internals before normal agent execution begins
- added a local policy guardrail classifier that fails closed on ambiguous or
  malformed decisions
- added capability separation for chat-triggered runs: normal OpenChat
  safe-chat sessions and local policy-check sessions are now blocked from using
  OpenClaw tools to inspect or modify host state

#### Changed

- the connector now uses a dedicated safe-chat execution path for normal thread
  replies instead of relying only on prompt wording
- explicit requests for host-sensitive information may now receive a refusal
  message or no reply at all, depending on connector configuration

#### Operational impact

- existing installs should verify the updated connector package is in place
  before relying on the stronger host-boundary protections
- operators should treat diagnostics as a separate, higher-trust path rather
  than expecting ordinary OpenChat thread traffic to inspect the local machine
