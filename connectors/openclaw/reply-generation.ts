import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";

import {
  type OpenChatInboundEnvelope,
  stringifyStageInput,
  type OpenChatStageInput
} from "./message-envelope.js";
import { buildStageSystemPrompt, type ConnectorPromptProfile } from "./prompt-profile.js";
import { runConnectorStructuredStage } from "./stage-runtime.js";
import {
  parseReplyGenerationResult,
  type EffectiveAddressingResult,
  type ParticipationGateResult,
  type ReplyGenerationResult
} from "./stage-results.js";

type DeliveryLike = {
  channel_id: string;
  delivery_id: string;
  message_id: string;
  thread_id: string;
  workspace_id: string;
};

function sanitizeOutboundReplyText(text: string) {
  let sanitized = text.trim();
  while (true) {
    const next = sanitized.replace(/^\s*\[\[[a-z0-9_-]+\]\]\s*/i, "");
    if (next === sanitized) {
      break;
    }
    sanitized = next.trimStart();
  }
  return sanitized.trim();
}

export function normalizeOutboundReplyForOpenChat(text: string): string | null {
  const sanitized = sanitizeOutboundReplyText(text);
  if (!sanitized) {
    return null;
  }
  if (/^NO_REPLY(?:$|[\s:;,.!?()[\]{}-])/i.test(sanitized)) {
    return null;
  }
  return sanitized;
}

export async function runReplyGeneration(params: {
  addressing: EffectiveAddressingResult;
  api: OpenClawPluginApi;
  delivery: DeliveryLike;
  envelope: OpenChatInboundEnvelope;
  extraInstructions?: string | null;
  openclawAgentId: string;
  participation: ParticipationGateResult;
  promptProfile: ConnectorPromptProfile;
}): Promise<ReplyGenerationResult> {
  const payload: OpenChatStageInput<
    "reply_generation",
    {
      addressing: EffectiveAddressingResult;
      participation: ParticipationGateResult;
    }
  > = {
    addressing: params.addressing,
    envelope: params.envelope,
    participation: params.participation,
    schema_version: "openchat.stage_input.v1",
    stage: "reply_generation"
  };
  const assistantText = await runConnectorStructuredStage({
    api: params.api,
    delivery: params.delivery,
    idempotencyKey: `openchat-stage:reply:${params.delivery.delivery_id}`,
    messagePayload: stringifyStageInput(payload),
    openclawAgentId: params.openclawAgentId,
    sessionNamespace: params.promptProfile.reply_generation.session_namespace,
    stageName: "reply_generation",
    systemPrompt: buildStageSystemPrompt(
      params.promptProfile.reply_generation,
      params.extraInstructions
    ),
    timeoutMs: 120000
  });
  const parsed = parseReplyGenerationResult(assistantText);
  if (!parsed) {
    return {
      confidence: "low",
      decision: "no_reply",
      reason: "reply generation returned malformed output"
    };
  }

  const normalizedText =
    parsed.decision === "reply" && parsed.reply_text
      ? normalizeOutboundReplyForOpenChat(parsed.reply_text)
      : null;
  if (parsed.decision === "reply" && !normalizedText) {
    return {
      confidence: parsed.confidence,
      decision: "no_reply",
      reason: "reply generation normalized to no reply"
    };
  }

  return normalizedText
    ? {
        ...parsed,
        reply_text: normalizedText
      }
    : parsed;
}
