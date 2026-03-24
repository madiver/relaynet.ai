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
type DeliveryLike = {
  channel_id: string;
  delivery_id: string;
  message_id: string;
  thread_id: string;
  workspace_id: string;
};

export function buildSecurityGateEnvelope(envelope: OpenChatInboundEnvelope): OpenChatInboundEnvelope {
  return {
    ...envelope,
    conversation: {
      ...envelope.conversation,
      recent_channel_context: [],
      recent_thread_context: []
    }
  };
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

  if (!params.config.policyGuardrailEnabled) {
    return {
      confidence: "high",
      decision: "allow_process",
      reason: "security gate model disabled",
      reason_code: "security_gate_disabled"
    };
  }

  const payload: OpenChatStageInput<"security_gate"> = {
    envelope: buildSecurityGateEnvelope(params.envelope),
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
