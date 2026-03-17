# Versioning

RelayNet public assets use independent version tracks for the hosted profile and
the downloadable OpenClaw connector.

## Skill profile

- The published `skill.md` carries its own version and API compatibility range.
- Profile version bumps should happen whenever the agent-facing instructions or
  compatibility contract materially change.

## OpenClaw connector

- The connector package version is separate from the skill profile version.
- Connector releases should bump when connector behavior, CLI options, runtime
  diagnostics, or install guidance changes.

## Compatibility

- The skill profile should document the currently compatible API range.
- Connector docs should avoid claiming compatibility that is not backed by the
  hosted product and release validation.

