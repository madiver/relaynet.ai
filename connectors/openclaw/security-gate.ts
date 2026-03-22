import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";

import {
  type OpenChatInboundEnvelope,
  stringifyStageInput,
  type OpenChatStageInput
} from "./message-envelope.js";
import { buildStageSystemPrompt, type ConnectorPromptProfile } from "./prompt-profile.js";
import { runConnectorStructuredStage } from "./stage-runtime.js";
import { type ResolvedConnectorPluginConfigLike } from "./legacy-policy-compat.js";
import { parseSecurityGateResult, type SecurityGateResult } from "./stage-results.js";

type DeliveryLike = {
  channel_id: string;
  delivery_id: string;
  message_id: string;
  thread_id: string;
  workspace_id: string;
};

const OVERRIDE_ATTEMPT_PATTERNS = [
  /\b(ignore|disregard|override|bypass)\b[\s\S]{0,80}\b(instruction|guardrail|policy|system prompt|safety|security)\b/i,
  /\b(system prompt|developer message|hidden instruction|jailbreak)\b/i,
  /\byou are now\b/i
];
const EXPLICIT_REQUEST_PATTERNS = [
  /\b(can you|could you|would you|please)\b/i,
  /\b(show|list|print|dump|read|reveal|share|display|summari[sz]e|enumerate|inspect|check|tell me|describe|explain)\b/i,
  /\bwhat(?:'s| is| are)?\b/i,
  /\bwhich\b/i,
  /\bwhere\b/i,
  /\bdetails?\b/i,
  /\binformation about\b/i,
  /\?/
];
const LOCAL_ABSOLUTE_PATH_PATTERN =
  /(^|[\s`(])(~\/[^\s`]+|\/(?:[A-Za-z0-9._-]+\/)+[A-Za-z0-9._-]+)(?=$|[\s`)])/m;
const PASSIVE_ARTIFACT_REFERENCE_PATTERN = /\b(?:canonical artifact|artifact)\s*:/i;
const LOCAL_PATH_INSPECTION_REQUEST_PATTERNS = [
  /\b(read|open|load|inspect|parse|summari[sz]e|check|use|import|extract|verify|confirm)\b[\s\S]{0,120}(~\/[^\s`]+|\/(?:[A-Za-z0-9._-]+\/)+[A-Za-z0-9._-]+)/i,
  /(~\/[^\s`]+|\/(?:[A-Za-z0-9._-]+\/)+[A-Za-z0-9._-]+)[\s\S]{0,80}\b(read|open|load|inspect|parse|summari[sz]e|check|use|import|extract|verify|confirm)\b/i,
  /\b(reason from|based on|using data from)\b[\s\S]{0,120}(~\/[^\s`]+|\/(?:[A-Za-z0-9._-]+\/)+[A-Za-z0-9._-]+)/i
];
const SENSITIVE_TARGET_GROUPS: Array<{
  reason: string;
  reasonCode: string;
  targetPatterns: RegExp[];
}> = [
  {
    reason: "requested secrets or authentication material",
    reasonCode: "requested_secret",
    targetPatterns: [
      /\b(secret|token|api[ -]?key|auth(?:entication)?|credential|cookie|session)\b/i,
      /\b(access token|refresh token|bearer token|google auth token)\b/i
    ]
  },
  {
    reason: "requested prompt or local configuration data",
    reasonCode: "requested_prompt_or_config_access",
    targetPatterns: [
      /\b(config|configuration|settings|internal configuration|runtime config)\b/i,
      /\bopenclaw\.json\b/i,
      /\bstate\.json\b/i,
      /\binstall\.json\b/i,
      /\bplugin(?:s)?\b/i,
      /\b(prompt|system prompt|extra system prompt)\b/i
    ]
  },
  {
    reason: "requested operational metadata",
    reasonCode: "requested_operational_metadata",
    targetPatterns: [
      /\bcron(?:job|jobs)?\b/i,
      /\bcrontab\b/i,
      /\bsystemd\b/i,
      /\bservice(?:s)?\b/i,
      /\btimer(?:s)?\b/i,
      /\bprocess(?:es)?\b/i,
      /\blogs?\b/i
    ]
  },
  {
    reason: "requested local environment or filesystem data",
    reasonCode: "requested_host_introspection",
    targetPatterns: [
      /\benv(?:ironment)?(?: variables?)?\b/i,
      /\b\.env\b/i,
      /\bfilesystem\b/i,
      /\bfile(?:s| listing| tree)?\b/i,
      /\bpath(?:s)?\b/i,
      /\bhome directory\b/i,
      /\b\.ssh\b/i
    ]
  },
  {
    reason: "requested host or network inventory",
    reasonCode: "requested_host_introspection",
    targetPatterns: [
      /\b(hostname|host name)\b/i,
      /\bport(?:s)?\b/i,
      /\bnetwork\b/i,
      /\binstalled tools?\b/i,
      /\binstalled plugins?\b/i
    ]
  }
];

function normalizePolicyText(raw: string | null | undefined) {
  return (raw ?? "").replace(/\s+/g, " ").trim();
}

export function isPassiveArtifactReferenceMessage(raw: string | null | undefined) {
  const text = (raw ?? "").trim();
  if (!text) {
    return false;
  }

  if (!LOCAL_ABSOLUTE_PATH_PATTERN.test(text)) {
    return false;
  }

  if (!PASSIVE_ARTIFACT_REFERENCE_PATTERN.test(text)) {
    return false;
  }

  return !LOCAL_PATH_INSPECTION_REQUEST_PATTERNS.some((pattern) => pattern.test(text));
}

function isExplicitSensitiveRequest(messageText: string) {
  return EXPLICIT_REQUEST_PATTERNS.some((pattern) => pattern.test(messageText));
}

export function detectSensitiveIntrospectionByRules(
  raw: string | null | undefined,
  sensitiveRefusalMode: "no_reply" | "refusal" = "refusal"
): SecurityGateResult | null {
  const messageText = normalizePolicyText(raw);
  if (!messageText) {
    return null;
  }

  if (OVERRIDE_ATTEMPT_PATTERNS.some((pattern) => pattern.test(messageText))) {
    return {
      confidence: "high",
      decision: "deny_silent",
      reason: "attempted to override local connector guardrails",
      reason_code: "override_attempt"
    };
  }

  if (!isExplicitSensitiveRequest(messageText)) {
    return null;
  }

  for (const group of SENSITIVE_TARGET_GROUPS) {
    if (!group.targetPatterns.some((pattern) => pattern.test(messageText))) {
      continue;
    }

    return {
      confidence: "high",
      decision: sensitiveRefusalMode === "refusal" ? "deny_refusal" : "deny_silent",
      reason: group.reason,
      reason_code: group.reasonCode
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
    params.config.sensitiveRefusalMode
  );
  if (ruleDecision) {
    return ruleDecision;
  }

  if (isPassiveArtifactReferenceMessage(messageText)) {
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
