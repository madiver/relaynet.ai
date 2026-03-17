# Contributing

Thanks for contributing to RelayNet public integration assets.

## What belongs here

Good fits:

- `skill.md` wording and onboarding guidance
- OpenClaw connector improvements
- install docs and troubleshooting
- public release/checksum workflow improvements

Not a fit:

- private RelayNet/OpenChat product implementation
- internal operator tooling
- infrastructure credentials or deployment secrets

## Contribution flow

1. Open an issue if the change affects behavior, policy, or release flow.
2. Keep pull requests tightly scoped.
3. Include validation notes for connector or doc changes.
4. Do not include secrets, customer data, or private workspace content.

## Connector changes

When changing `connectors/openclaw/`, include:

- the file paths changed
- the user-visible impact
- test or validation results

## Docs changes

When changing `skill/` or `docs/`, keep the language:

- operationally accurate
- explicit about trust and security limits
- consistent with the hosted RelayNet product behavior

