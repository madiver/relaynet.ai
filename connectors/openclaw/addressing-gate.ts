import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";

import {
  type OpenChatInboundEnvelope,
  stringifyStageInput,
  type OpenChatStageInput
} from "./message-envelope.js";
import { buildStageSystemPrompt, type ConnectorPromptProfile } from "./prompt-profile.js";
import { runConnectorStructuredStage } from "./stage-runtime.js";
import {
  parseAddressingGateResult,
  type AddressingGateResult,
  type EffectiveAddressingResult
} from "./stage-results.js";

type DeliveryLike = {
  channel_id: string;
  delivery_id: string;
  message_id: string;
  thread_id: string;
  workspace_id: string;
};

export function authoritativeAddressingResult(
  envelope: OpenChatInboundEnvelope
): EffectiveAddressingResult | null {
  if (!envelope.authoritative_addressing.is_addressed) {
    return null;
  }

  return {
    confidence: "high",
    decision: "addressed",
    reason: "structured routing facts show the message is addressed to the recipient",
    signals: [...envelope.authoritative_addressing.signals],
    source: "authoritative"
  };
}

export async function resolveInboundAddressing(params: {
  api: OpenClawPluginApi;
  delivery: DeliveryLike;
  envelope: OpenChatInboundEnvelope;
  openclawAgentId: string;
  promptProfile: ConnectorPromptProfile;
}): Promise<EffectiveAddressingResult> {
  const authoritative = authoritativeAddressingResult(params.envelope);
  if (authoritative) {
    return authoritative;
  }

  const payload: OpenChatStageInput<"addressing_gate"> = {
    envelope: params.envelope,
    schema_version: "openchat.stage_input.v1",
    stage: "addressing_gate"
  };
  const assistantText = await runConnectorStructuredStage({
    api: params.api,
    delivery: params.delivery,
    idempotencyKey: `openchat-stage:addressing:${params.delivery.delivery_id}`,
    messagePayload: stringifyStageInput(payload),
    openclawAgentId: params.openclawAgentId,
    sessionNamespace: params.promptProfile.addressing_gate.session_namespace,
    stageName: "addressing_gate",
    systemPrompt: buildStageSystemPrompt(params.promptProfile.addressing_gate),
    timeoutMs: 30000
  });
  const parsed = parseAddressingGateResult(assistantText);
  if (!parsed) {
    return {
      confidence: "low",
      decision: "uncertain",
      reason: "addressing gate returned malformed output",
      signals: [],
      source: "inference"
    };
  }

  return {
    confidence: parsed.confidence,
    decision: parsed.decision === "inferred_addressed" ? "addressed" : parsed.decision,
    reason: parsed.reason,
    signals: parsed.signals,
    source: "inference"
  };
}
