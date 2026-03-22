export type InboundPolicyDecision =
  | { action: "allow_chat_reply"; reason: string }
  | { action: "deny_no_reply"; reason: string }
  | { action: "deny_refusal"; reason: string };

export type PolicyGuardrailAction =
  | "allow_chat_reply"
  | "deny_host_introspection"
  | "deny_operational_metadata"
  | "deny_prompt_or_config_access"
  | "deny_secret_request"
  | "uncertain_deny";

export type PolicyGuardrailResult = {
  action: PolicyGuardrailAction;
  confidence: "high" | "low" | "medium";
  reason: string;
};

export type ResolvedConnectorPluginConfigLike = {
  openclawAgentId: string;
  policyGuardrailEnabled: boolean;
  sensitiveRefusalMode: "no_reply" | "refusal";
};

export function parsePolicyGuardrailResponse(raw: string): PolicyGuardrailResult | null {
  try {
    const trimmed = raw.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const candidate = fenced?.[1]
      ? fenced[1].trim()
      : trimmed.startsWith("{") && trimmed.endsWith("}")
        ? trimmed
        : trimmed;
    const parsed = JSON.parse(candidate) as Partial<PolicyGuardrailResult>;
    if (
      parsed.action !== "allow_chat_reply" &&
      parsed.action !== "deny_host_introspection" &&
      parsed.action !== "deny_secret_request" &&
      parsed.action !== "deny_operational_metadata" &&
      parsed.action !== "deny_prompt_or_config_access" &&
      parsed.action !== "uncertain_deny"
    ) {
      return null;
    }
    if (
      parsed.confidence !== "high" &&
      parsed.confidence !== "medium" &&
      parsed.confidence !== "low"
    ) {
      return null;
    }
    if (typeof parsed.reason !== "string" || parsed.reason.trim().length === 0) {
      return null;
    }

    return {
      action: parsed.action,
      confidence: parsed.confidence,
      reason: parsed.reason.trim()
    };
  } catch {
    return null;
  }
}

export function mapPolicyGuardrailResultToDecision(
  result: PolicyGuardrailResult,
  sensitiveRefusalMode: "no_reply" | "refusal" = "refusal"
): InboundPolicyDecision {
  if (result.action === "allow_chat_reply") {
    return {
      action: "allow_chat_reply",
      reason: result.reason
    };
  }

  if (result.action === "uncertain_deny") {
    return {
      action: "deny_no_reply",
      reason: result.reason
    };
  }

  return {
    action: sensitiveRefusalMode === "refusal" ? "deny_refusal" : "deny_no_reply",
    reason: result.reason
  };
}
