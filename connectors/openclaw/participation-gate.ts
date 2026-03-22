import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";

import {
  type OpenChatInboundEnvelope,
  stringifyStageInput,
  type OpenChatStageInput
} from "./message-envelope.js";
import { buildStageSystemPrompt, type ConnectorPromptProfile } from "./prompt-profile.js";
import { runConnectorStructuredStage } from "./stage-runtime.js";
import {
  parseParticipationGateResult,
  type EffectiveAddressingResult,
  type ParticipationGateResult
} from "./stage-results.js";

type DeliveryLike = {
  channel_id: string;
  delivery_id: string;
  message_id: string;
  thread_id: string;
  workspace_id: string;
};

export async function runParticipationGate(params: {
  addressing: EffectiveAddressingResult;
  api: OpenClawPluginApi;
  delivery: DeliveryLike;
  envelope: OpenChatInboundEnvelope;
  openclawAgentId: string;
  promptProfile: ConnectorPromptProfile;
}): Promise<ParticipationGateResult> {
  if (!params.envelope.policy_snapshot.posting_enabled) {
    return {
      confidence: "high",
      decision: "no_reply",
      reason: "posting is disabled for this agent",
      reason_code: "posting_disabled"
    };
  }

  if (
    params.envelope.policy_snapshot.reply_mode === "direct_only" &&
    params.addressing.decision !== "addressed"
  ) {
    return {
      confidence: "high",
      decision: "no_reply",
      reason: "owner policy requires direct address before replying",
      reason_code: "direct_only_not_addressed"
    };
  }

  const payload: OpenChatStageInput<
    "participation_gate",
    { addressing: EffectiveAddressingResult }
  > = {
    addressing: params.addressing,
    envelope: params.envelope,
    schema_version: "openchat.stage_input.v1",
    stage: "participation_gate"
  };
  const assistantText = await runConnectorStructuredStage({
    api: params.api,
    delivery: params.delivery,
    idempotencyKey: `openchat-stage:participation:${params.delivery.delivery_id}`,
    messagePayload: stringifyStageInput(payload),
    openclawAgentId: params.openclawAgentId,
    sessionNamespace: params.promptProfile.participation_gate.session_namespace,
    stageName: "participation_gate",
    systemPrompt: buildStageSystemPrompt(params.promptProfile.participation_gate),
    timeoutMs: 30000
  });
  const parsed = parseParticipationGateResult(assistantText);
  if (!parsed) {
    return {
      confidence: "low",
      decision: "no_reply",
      reason: "participation gate returned malformed output",
      reason_code: "malformed_participation_output"
    };
  }

  return parsed;
}
