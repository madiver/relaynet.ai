import {
  domainAllowedByPolicy,
  policyAllowsCapability,
  type ResolvedConnectorOwnerPolicy
} from "./owner-policy.js";

const OPENCHAT_SAFE_SESSION_SEGMENT = "openchat-safe";
const OPENCHAT_POLICY_SESSION_SEGMENT = "openchat-policy";

export type RestrictedOpenChatToolDecision =
  | {
      blocked: false;
      publicWebContextUrl?: string;
    }
  | {
      blocked: true;
      reason: string;
    };

const RESTRICTED_PUBLIC_WEB_NAVIGATION_TOOL_SUFFIXES = [
  "browser_navigate",
  "browser_open",
  "browser_goto"
];
const RESTRICTED_PUBLIC_WEB_BROWSER_TOOL_NAMES = ["browser"];
const RESTRICTED_PUBLIC_WEB_FOLLOWUP_TOOL_SUFFIXES = [
  "browser_snapshot",
  "browser_take_screenshot",
  "browser_wait_for"
];
const RESTRICTED_PUBLIC_WEB_FETCH_TOOL_SUFFIXES = ["fetch", "web_fetch"];
const RESTRICTED_PUBLIC_WEB_SEARCH_TOOL_SUFFIXES = ["web_search"];
const RESTRICTED_PUBLIC_WEB_BROWSER_OPEN_ACTIONS = ["open"];
const RESTRICTED_PUBLIC_WEB_BROWSER_FOLLOWUP_ACTIONS = [
  "snapshot",
  "screenshot",
  "take_screenshot",
  "wait",
  "wait_for"
];
const RESTRICTED_OPENCHAT_PUBLIC_WEB_CONTEXT_TTL_MS = 10 * 60 * 1000;

const restrictedOpenChatPublicWebContexts = new Map<string, { recordedAt: number; url: string }>();

function pruneRestrictedOpenChatPublicWebContexts(now = Date.now()) {
  for (const [sessionKey, entry] of restrictedOpenChatPublicWebContexts.entries()) {
    if (now - entry.recordedAt > RESTRICTED_OPENCHAT_PUBLIC_WEB_CONTEXT_TTL_MS) {
      restrictedOpenChatPublicWebContexts.delete(sessionKey);
    }
  }
}

function restrictedToolNameMatchesSuffix(toolName: string, suffixes: string[]) {
  return suffixes.some(
    (suffix) =>
      toolName === suffix ||
      toolName.endsWith(`__${suffix}`) ||
      toolName.endsWith(`.${suffix}`) ||
      toolName.endsWith(`:${suffix}`) ||
      toolName.endsWith(`/${suffix}`)
  );
}

function isPotentialIpv4Hostname(hostname: string) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
}

function isPrivateOrLoopbackHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized.endsWith(".local")
  ) {
    return true;
  }
  if (isPotentialIpv4Hostname(normalized)) {
    const octets = normalized.split(".").map((value) => Number.parseInt(value, 10));
    const first = octets[0] ?? -1;
    const second = octets[1] ?? -1;
    if (octets.some((value) => Number.isNaN(value) || value < 0 || value > 255)) {
      return true;
    }
    if (
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    ) {
      return true;
    }
  }
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:")) {
    return true;
  }
  if (!normalized.includes(".") && !isPotentialIpv4Hostname(normalized)) {
    return true;
  }
  return false;
}

function extractUrlCandidateFromToolParams(
  params: unknown,
  visited = new Set<unknown>()
): string | null {
  if (typeof params === "string") {
    return params.trim() || null;
  }
  if (!params || typeof params !== "object" || visited.has(params)) {
    return null;
  }
  visited.add(params);
  if (Array.isArray(params)) {
    for (const item of params) {
      const candidate = extractUrlCandidateFromToolParams(item, visited);
      if (candidate) {
        return candidate;
      }
    }
    return null;
  }
  const record = params as Record<string, unknown>;
  for (const key of ["url", "href", "uri", "input"]) {
    if (typeof record[key] === "string" && record[key].trim()) {
      return record[key].trim();
    }
  }
  for (const value of Object.values(record)) {
    const candidate = extractUrlCandidateFromToolParams(value, visited);
    if (candidate) {
      return candidate;
    }
  }
  return null;
}

function extractBrowserActionCandidateFromToolParams(
  params: unknown,
  visited = new Set<unknown>()
): string | null {
  if (typeof params === "string") {
    return params.trim().toLowerCase() || null;
  }
  if (!params || typeof params !== "object" || visited.has(params)) {
    return null;
  }
  visited.add(params);
  if (Array.isArray(params)) {
    for (const item of params) {
      const candidate = extractBrowserActionCandidateFromToolParams(item, visited);
      if (candidate) {
        return candidate;
      }
    }
    return null;
  }
  const record = params as Record<string, unknown>;
  for (const key of ["action", "mode", "operation"]) {
    if (typeof record[key] === "string" && record[key].trim()) {
      return record[key].trim().toLowerCase();
    }
  }
  for (const value of Object.values(record)) {
    const candidate = extractBrowserActionCandidateFromToolParams(value, visited);
    if (candidate) {
      return candidate;
    }
  }
  return null;
}

function normalizeRestrictedOpenChatPublicWebUrl(
  rawUrl: string | null | undefined,
  ownerPolicy: ResolvedConnectorOwnerPolicy
) {
  const trimmed = (rawUrl ?? "").trim();
  if (!trimmed) {
    return {
      error:
        "OpenChat safe-chat sessions may only inspect public websites when the tool call includes an explicit http/https URL.",
      url: null
    };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      error:
        "OpenChat safe-chat sessions may only inspect public websites with a valid absolute http/https URL.",
      url: null
    };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      error:
        "OpenChat safe-chat sessions may only inspect public http/https websites, not local files or other schemes.",
      url: null
    };
  }
  if (parsed.username || parsed.password) {
    return {
      error:
        "OpenChat safe-chat sessions cannot inspect URLs that embed credentials. Use a public page instead.",
      url: null
    };
  }
  if (isPrivateOrLoopbackHostname(parsed.hostname)) {
    return {
      error:
        "OpenChat safe-chat sessions cannot inspect localhost, private-network, or browser-internal URLs.",
      url: null
    };
  }
  if (!domainAllowedByPolicy(ownerPolicy, parsed.hostname)) {
    return {
      error:
        "OpenChat safe-chat sessions cannot inspect that public domain because owner policy has not allowed it.",
      url: null
    };
  }
  return {
    error: null,
    url: parsed.toString()
  };
}

function canRestrictedOpenChatSessionUsePublicWebFollowupTool(
  sessionKey: string | null | undefined
) {
  const normalizedSessionKey = (sessionKey ?? "").trim();
  if (!normalizedSessionKey) {
    return false;
  }
  pruneRestrictedOpenChatPublicWebContexts();
  return restrictedOpenChatPublicWebContexts.has(normalizedSessionKey);
}

function rememberRestrictedOpenChatPublicWebContext(
  sessionKey: string | null | undefined,
  url: string | null | undefined
) {
  const normalizedSessionKey = (sessionKey ?? "").trim();
  const normalizedUrl = (url ?? "").trim();
  if (!normalizedSessionKey || !normalizedUrl) {
    return;
  }
  pruneRestrictedOpenChatPublicWebContexts();
  restrictedOpenChatPublicWebContexts.set(normalizedSessionKey, {
    recordedAt: Date.now(),
    url: normalizedUrl
  });
}

export function isRestrictedOpenChatSessionKey(sessionKey: string | null | undefined) {
  const value = (sessionKey ?? "").trim();
  return (
    value.includes(`:${OPENCHAT_SAFE_SESSION_SEGMENT}:`) ||
    value.includes(`:${OPENCHAT_POLICY_SESSION_SEGMENT}:`)
  );
}

export function evaluateRestrictedOpenChatToolCall(
  sessionKey: string | null | undefined,
  toolName: string | null | undefined,
  ownerPolicy: ResolvedConnectorOwnerPolicy,
  toolParams?: unknown
): RestrictedOpenChatToolDecision {
  const normalizedToolName = (toolName ?? "").trim().toLowerCase();
  if (!normalizedToolName || !isRestrictedOpenChatSessionKey(sessionKey)) {
    return { blocked: false };
  }

  if (
    restrictedToolNameMatchesSuffix(normalizedToolName, RESTRICTED_PUBLIC_WEB_SEARCH_TOOL_SUFFIXES)
  ) {
    if (!policyAllowsCapability(ownerPolicy, "public_web_search")) {
      return {
        blocked: true,
        reason:
          "Owner policy does not permit read-only public web search in OpenChat safe-chat sessions."
      };
    }
    return { blocked: false };
  }

  if (
    restrictedToolNameMatchesSuffix(normalizedToolName, RESTRICTED_PUBLIC_WEB_NAVIGATION_TOOL_SUFFIXES) ||
    restrictedToolNameMatchesSuffix(normalizedToolName, RESTRICTED_PUBLIC_WEB_FETCH_TOOL_SUFFIXES)
  ) {
    const capability = restrictedToolNameMatchesSuffix(
      normalizedToolName,
      RESTRICTED_PUBLIC_WEB_FETCH_TOOL_SUFFIXES
    )
      ? "public_web_fetch"
      : "public_web_browse_readonly";
    if (!policyAllowsCapability(ownerPolicy, capability)) {
      return {
        blocked: true,
        reason:
          capability === "public_web_fetch"
            ? "Owner policy does not permit public web fetches in OpenChat safe-chat sessions."
            : "Owner policy does not permit rendered browser inspection in OpenChat safe-chat sessions."
      };
    }
    const urlCandidate = extractUrlCandidateFromToolParams(toolParams);
    const normalizedUrl = normalizeRestrictedOpenChatPublicWebUrl(urlCandidate, ownerPolicy);
    if (normalizedUrl.error || !normalizedUrl.url) {
      return {
        blocked: true,
        reason:
          normalizedUrl.error ??
          "OpenChat safe-chat sessions may only inspect public websites with an explicit http/https URL."
      };
    }
    rememberRestrictedOpenChatPublicWebContext(sessionKey, normalizedUrl.url);
    return {
      blocked: false,
      publicWebContextUrl: normalizedUrl.url
    };
  }

  if (
    restrictedToolNameMatchesSuffix(normalizedToolName, RESTRICTED_PUBLIC_WEB_BROWSER_TOOL_NAMES)
  ) {
    const browserAction = extractBrowserActionCandidateFromToolParams(toolParams);
    if (
      browserAction &&
      RESTRICTED_PUBLIC_WEB_BROWSER_OPEN_ACTIONS.includes(browserAction)
    ) {
      if (!policyAllowsCapability(ownerPolicy, "public_web_browse_readonly")) {
        return {
          blocked: true,
          reason:
            "Owner policy does not permit rendered browser inspection in OpenChat safe-chat sessions."
        };
      }
      const urlCandidate = extractUrlCandidateFromToolParams(toolParams);
      const normalizedUrl = normalizeRestrictedOpenChatPublicWebUrl(urlCandidate, ownerPolicy);
      if (normalizedUrl.error || !normalizedUrl.url) {
        return {
          blocked: true,
          reason:
            normalizedUrl.error ??
            "OpenChat safe-chat sessions may only inspect public websites with an explicit http/https URL."
        };
      }
      rememberRestrictedOpenChatPublicWebContext(sessionKey, normalizedUrl.url);
      return {
        blocked: false,
        publicWebContextUrl: normalizedUrl.url
      };
    }

    if (
      browserAction &&
      RESTRICTED_PUBLIC_WEB_BROWSER_FOLLOWUP_ACTIONS.includes(browserAction)
    ) {
      if (!policyAllowsCapability(ownerPolicy, "public_web_browse_readonly")) {
        return {
          blocked: true,
          reason:
            "Owner policy does not permit rendered browser inspection in OpenChat safe-chat sessions."
        };
      }
      if (canRestrictedOpenChatSessionUsePublicWebFollowupTool(sessionKey)) {
        return { blocked: false };
      }
      return {
        blocked: true,
        reason:
          "OpenChat safe-chat sessions can use read-only browser follow-up tools only after first navigating to a public http/https URL."
      };
    }
  }

  if (
    restrictedToolNameMatchesSuffix(normalizedToolName, RESTRICTED_PUBLIC_WEB_FOLLOWUP_TOOL_SUFFIXES)
  ) {
    if (!policyAllowsCapability(ownerPolicy, "public_web_browse_readonly")) {
      return {
        blocked: true,
        reason:
          "Owner policy does not permit rendered browser inspection in OpenChat safe-chat sessions."
      };
    }
    if (canRestrictedOpenChatSessionUsePublicWebFollowupTool(sessionKey)) {
      return { blocked: false };
    }
    return {
      blocked: true,
      reason:
        "OpenChat safe-chat sessions can use read-only browser follow-up tools only after first navigating to a public http/https URL."
    };
  }

  return {
    blocked: true,
    reason:
      "OpenChat safe-chat sessions cannot inspect local or browser state, run commands, or use mutating tools."
  };
}

export function shouldBlockToolForRestrictedOpenChatSession(
  sessionKey: string | null | undefined,
  toolName: string | null | undefined,
  ownerPolicy: ResolvedConnectorOwnerPolicy,
  toolParams?: unknown
) {
  return evaluateRestrictedOpenChatToolCall(sessionKey, toolName, ownerPolicy, toolParams).blocked;
}
