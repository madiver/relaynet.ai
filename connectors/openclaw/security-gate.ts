import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";

import {
  type OpenChatInboundEnvelope,
  stringifyStageInput,
  type OpenChatStageInput
} from "./message-envelope.js";
import {
  buildStageSystemPrompt,
  loadConnectorPromptProfile,
  type ConnectorPromptProfile
} from "./prompt-profile.js";
import { runConnectorStructuredStage } from "./stage-runtime.js";
import { type ResolvedConnectorPluginConfigLike } from "./legacy-policy-compat.js";
import { parseSecurityGateResult, type SecurityGateResult } from "./stage-results.js";
import { type ConnectorDeterministicSecurityPolicy } from "./connector-messaging.js";

type DeliveryLike = {
  channel_id: string;
  delivery_id: string;
  message_id: string;
  thread_id: string;
  workspace_id: string;
};

const LOCAL_ABSOLUTE_PATH_PATTERN =
  /(^|[\s`(])(~\/[^\s`]+|\/(?:[A-Za-z0-9._-]+\/)+[A-Za-z0-9._-]+)(?=$|[\s`)])/m;

function normalizePolicyText(raw: string | null | undefined) {
  return (raw ?? "").replace(/\s+/g, " ").trim();
}

function normalizeLookupText(raw: string | null | undefined) {
  return normalizePolicyText(raw).toLowerCase();
}

function escapeRegex(term: string) {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsNormalizedTerm(normalizedText: string, term: string) {
  const normalizedTerm = normalizeLookupText(term);
  if (!normalizedTerm) {
    return false;
  }

  if (/^[^a-z0-9]+$/i.test(normalizedTerm)) {
    return normalizedText.includes(normalizedTerm);
  }

  const escaped = escapeRegex(normalizedTerm).replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^a-z0-9_])${escaped}($|[^a-z0-9_])`, "i").test(normalizedText);
}

function containsAnyTerm(normalizedText: string, terms: string[]) {
  return terms.some((term) => containsNormalizedTerm(normalizedText, term));
}

export function isPassiveArtifactReferenceMessage(raw: string | null | undefined) {
  return isPassiveArtifactReferenceMessageWithPolicy(
    raw,
    loadConnectorPromptProfile().security_gate.deterministic_policy
  );
}

export function isPassiveArtifactReferenceMessageWithPolicy(
  raw: string | null | undefined,
  deterministicPolicy: ConnectorDeterministicSecurityPolicy
) {
  const text = (raw ?? "").trim();
  if (!text) {
    return false;
  }

  if (!LOCAL_ABSOLUTE_PATH_PATTERN.test(text)) {
    return false;
  }

  const normalizedText = normalizeLookupText(text);
  if (!containsAnyTerm(normalizedText, deterministicPolicy.passive_artifact_labels)) {
    return false;
  }

  return !containsAnyTerm(normalizedText, deterministicPolicy.local_path_inspection_terms);
}

function isOverrideAttempt(
  normalizedText: string,
  deterministicPolicy: ConnectorDeterministicSecurityPolicy
) {
  if (containsAnyTerm(normalizedText, deterministicPolicy.override_attempt.direct_phrases)) {
    return true;
  }

  return (
    containsAnyTerm(normalizedText, deterministicPolicy.override_attempt.command_terms) &&
    containsAnyTerm(normalizedText, deterministicPolicy.override_attempt.protected_terms)
  );
}

function isExplicitSensitiveRequest(
  normalizedText: string,
  deterministicPolicy: ConnectorDeterministicSecurityPolicy
) {
  return containsAnyTerm(normalizedText, deterministicPolicy.explicit_request_terms);
}

export function detectSensitiveIntrospectionByRules(
  raw: string | null | undefined,
  deterministicPolicy: ConnectorDeterministicSecurityPolicy = loadConnectorPromptProfile().security_gate
    .deterministic_policy,
  sensitiveRefusalMode: "no_reply" | "refusal" = "refusal"
): SecurityGateResult | null {
  const messageText = normalizePolicyText(raw);
  if (!messageText) {
    return null;
  }

  const normalizedText = normalizeLookupText(messageText);

  if (isOverrideAttempt(normalizedText, deterministicPolicy)) {
    return {
      confidence: "high",
      decision: "deny_silent",
      reason: "attempted to override local connector guardrails",
      reason_code: "override_attempt"
    };
  }

  if (LOCAL_ABSOLUTE_PATH_PATTERN.test(messageText)) {
    if (
      containsAnyTerm(normalizedText, deterministicPolicy.local_path_inspection_terms) &&
      !isPassiveArtifactReferenceMessageWithPolicy(messageText, deterministicPolicy)
    ) {
      return {
        confidence: "high",
        decision: sensitiveRefusalMode === "refusal" ? "deny_refusal" : "deny_silent",
        reason: "requested local environment or filesystem data",
        reason_code: "requested_host_introspection"
      };
    }
  }

  if (!isExplicitSensitiveRequest(normalizedText, deterministicPolicy)) {
    return null;
  }

  for (const category of deterministicPolicy.sensitive_categories) {
    if (!containsAnyTerm(normalizedText, category.target_terms)) {
      continue;
    }

    return {
      confidence: "high",
      decision: sensitiveRefusalMode === "refusal" ? "deny_refusal" : "deny_silent",
      reason: category.reason,
      reason_code: category.reason_code
    };
  }

  return null;
}

export async function runSecurityGate(params: {
  api: OpenClawPluginApi;
  config: Pick<
    ResolvedConnectorPluginConfigLike,
    "openclawAgentId" | "policyGuardrailEnabled" | "sensitiveRefusalMode"
  >;
  delivery: DeliveryLike;
  envelope: OpenChatInboundEnvelope;
  promptProfile: ConnectorPromptProfile;
}): Promise<SecurityGateResult> {
  const messageText = params.envelope.message.text;
  if (!messageText.trim()) {
    return {
      confidence: "high",
      decision: "allow_process",
      reason: "message has no text body",
      reason_code: "empty_text_body"
    };
  }

  const ruleDecision = detectSensitiveIntrospectionByRules(
    messageText,
    params.promptProfile.security_gate.deterministic_policy,
    params.config.sensitiveRefusalMode
  );
  if (ruleDecision) {
    return ruleDecision;
  }

  if (
    isPassiveArtifactReferenceMessageWithPolicy(
      messageText,
      params.promptProfile.security_gate.deterministic_policy
    )
  ) {
    return {
      confidence: "high",
      decision: "allow_process",
      reason: "message only cites a local artifact path without requesting inspection",
      reason_code: "passive_artifact_reference"
    };
  }

  if (!params.config.policyGuardrailEnabled) {
    return {
      confidence: "high",
      decision: "allow_process",
      reason: "security gate model disabled",
      reason_code: "security_gate_disabled"
    };
  }

  const payload: OpenChatStageInput<"security_gate"> = {
    envelope: params.envelope,
    schema_version: "openchat.stage_input.v1",
    stage: "security_gate"
  };
  const assistantText = await runConnectorStructuredStage({
    api: params.api,
    delivery: params.delivery,
    idempotencyKey: `openchat-stage:security:${params.delivery.delivery_id}`,
    messagePayload: stringifyStageInput(payload),
    openclawAgentId: params.config.openclawAgentId,
    sessionNamespace: params.promptProfile.security_gate.session_namespace,
    stageName: "security_gate",
    systemPrompt: buildStageSystemPrompt(params.promptProfile.security_gate),
    timeoutMs: 30000
  });
  const parsed = parseSecurityGateResult(assistantText);
  if (!parsed) {
    return {
      confidence: "high",
      decision: "deny_silent",
      reason: "security gate returned malformed output",
      reason_code: "malformed_security_gate_output"
    };
  }

  return parsed;
}
