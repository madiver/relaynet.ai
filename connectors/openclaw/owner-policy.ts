export const CONNECTOR_CAPABILITIES = [
  "public_web_search",
  "public_web_fetch",
  "public_web_browse_readonly",
  "local_diagnostics",
  "filesystem_read",
  "browser_mutation",
  "shell_exec"
] as const;

export type ConnectorCapability = (typeof CONNECTOR_CAPABILITIES)[number];

export type ConnectorReplyMode = "direct_only" | "guided";

export type ConnectorRuntimeConfigManagementMode =
  | "auto_repair"
  | "repair_missing_only"
  | "warn_only";

export type ConnectorOwnerPolicyInput = {
  allowedCapabilities?: readonly string[] | string | null;
  allowedDomains?: readonly string[] | string | null;
  blockedCapabilities?: readonly string[] | string | null;
  replyMode?: ConnectorReplyMode | null;
  runtimeConfigManagement?: ConnectorRuntimeConfigManagementMode | null;
};

export type ResolvedConnectorOwnerPolicy = {
  allowedDomains: string[] | null;
  blockedCapabilities: ConnectorCapability[];
  configuredAllowedCapabilities: ConnectorCapability[] | null;
  effectiveCapabilities: ConnectorCapability[];
  replyMode: ConnectorReplyMode;
  runtimeConfigManagement: ConnectorRuntimeConfigManagementMode;
};

const DEFAULT_CONNECTOR_CAPABILITIES: ConnectorCapability[] = [
  "public_web_search",
  "public_web_fetch",
  "public_web_browse_readonly"
];

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function normalizeStringList(raw: readonly string[] | string | null | undefined) {
  if (Array.isArray(raw)) {
    return uniqueStrings(
      raw
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    );
  }

  if (typeof raw === "string") {
    return uniqueStrings(
      raw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    );
  }

  return [];
}

function normalizeCapabilities(raw: readonly string[] | string | null | undefined) {
  const requested = normalizeStringList(raw);
  const known = new Set<string>(CONNECTOR_CAPABILITIES);
  return requested.filter((value): value is ConnectorCapability => known.has(value));
}

function normalizeAllowedDomains(raw: readonly string[] | string | null | undefined) {
  const requested = normalizeStringList(raw)
    .map((value) => value.toLowerCase())
    .map((value) => value.replace(/^\*\./, ""))
    .map((value) => value.replace(/\.$/, ""))
    .filter(Boolean);

  return requested.length > 0 ? requested : null;
}

export function resolveConnectorOwnerPolicy(
  input: ConnectorOwnerPolicyInput | null | undefined
): ResolvedConnectorOwnerPolicy {
  const configuredAllowedCapabilities = normalizeCapabilities(input?.allowedCapabilities);
  const blockedCapabilities = normalizeCapabilities(input?.blockedCapabilities);

  const baseCapabilities =
    configuredAllowedCapabilities.length > 0
      ? configuredAllowedCapabilities
      : DEFAULT_CONNECTOR_CAPABILITIES;
  const blocked = new Set<ConnectorCapability>(blockedCapabilities);
  const effectiveCapabilities = baseCapabilities.filter((value) => !blocked.has(value));

  return {
    allowedDomains: normalizeAllowedDomains(input?.allowedDomains),
    blockedCapabilities,
    configuredAllowedCapabilities:
      configuredAllowedCapabilities.length > 0 ? configuredAllowedCapabilities : null,
    effectiveCapabilities,
    replyMode: input?.replyMode === "direct_only" ? "direct_only" : "guided",
    runtimeConfigManagement:
      input?.runtimeConfigManagement === "warn_only" ||
      input?.runtimeConfigManagement === "repair_missing_only"
        ? input.runtimeConfigManagement
        : "auto_repair"
  };
}

export function policyAllowsCapability(
  policy: ResolvedConnectorOwnerPolicy,
  capability: ConnectorCapability
) {
  return policy.effectiveCapabilities.includes(capability);
}

export function domainAllowedByPolicy(
  policy: ResolvedConnectorOwnerPolicy,
  hostname: string
) {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (!policy.allowedDomains || policy.allowedDomains.length === 0) {
    return true;
  }
  return policy.allowedDomains.some(
    (domain) => normalized === domain || normalized.endsWith(`.${domain}`)
  );
}

export function formatOwnerPolicySummaryLines(policy: ResolvedConnectorOwnerPolicy) {
  return [
    `- Reply mode: ${policy.replyMode}`,
    `- Runtime config management: ${policy.runtimeConfigManagement}`,
    `- Effective capabilities: ${
      policy.effectiveCapabilities.length > 0
        ? policy.effectiveCapabilities.join(", ")
        : "(none)"
    }`,
    `- Explicitly blocked capabilities: ${
      policy.blockedCapabilities.length > 0
        ? policy.blockedCapabilities.join(", ")
        : "(none)"
    }`,
    `- Allowed public domains: ${
      policy.allowedDomains && policy.allowedDomains.length > 0
        ? policy.allowedDomains.join(", ")
        : "(any public domain)"
    }`
  ];
}

export function formatOwnerPolicyPromptLines(policy: ResolvedConnectorOwnerPolicy) {
  const lines = [
    policy.replyMode === "direct_only"
      ? "Owner policy requires direct address before you reply. If this message does not clearly address or mention you, return NO_REPLY without using tools."
      : "Owner policy leaves the reply decision to your normal OpenChat participation rules.",
    `Owner-allowed capabilities in this session: ${
      policy.effectiveCapabilities.length > 0
        ? policy.effectiveCapabilities.join(", ")
        : "none"
    }.`
  ];

  if (policy.allowedDomains && policy.allowedDomains.length > 0) {
    lines.push(
      `Public web access is limited to these domains and their subdomains: ${policy.allowedDomains.join(", ")}.`
    );
  }

  if (policy.blockedCapabilities.length > 0) {
    lines.push(
      `Owner-blocked capabilities: ${policy.blockedCapabilities.join(", ")}.`
    );
  }

  return lines;
}
