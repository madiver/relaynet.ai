import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";

type DeliveryLike = {
  channel_id: string;
  delivery_id: string;
  message_id: string;
  thread_id: string;
  workspace_id: string;
};

type SessionMessage = {
  content?: Array<{ text?: string; type?: string }> | string;
  role?: string;
};

function sanitizeSessionSegment(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unknown"
  );
}

function collectMessageText(message: SessionMessage | null | undefined): string {
  if (!message) {
    return "";
  }
  if (typeof message.content === "string") {
    return message.content.trim();
  }
  if (!Array.isArray(message.content)) {
    return "";
  }
  return message.content
    .filter((item) => item?.type === "text" && typeof item.text === "string")
    .map((item) => item.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function latestAssistantText(messages: unknown[]): string {
  const reversed = [...messages].reverse() as SessionMessage[];
  for (const message of reversed) {
    if (message?.role !== "assistant") {
      continue;
    }
    const text = collectMessageText(message);
    if (text) {
      return text;
    }
  }
  return "";
}

function buildStageSessionKey(params: {
  delivery: DeliveryLike;
  openclawAgentId: string;
  sessionNamespace: "policy" | "safe";
  stageName: string;
}) {
  const sessionSegment =
    params.sessionNamespace === "safe" ? "openchat-safe" : "openchat-policy";
  return (
    `agent:${sanitizeSessionSegment(params.openclawAgentId)}` +
    `:${sessionSegment}:stage:${sanitizeSessionSegment(params.stageName)}` +
    `:workspace:${sanitizeSessionSegment(params.delivery.workspace_id)}` +
    `:channel:${sanitizeSessionSegment(params.delivery.channel_id)}` +
    `:thread:${sanitizeSessionSegment(params.delivery.thread_id)}` +
    `:message:${sanitizeSessionSegment(params.delivery.message_id)}`
  );
}

export async function runConnectorStructuredStage(params: {
  api: OpenClawPluginApi;
  delivery: DeliveryLike;
  idempotencyKey: string;
  messagePayload: string;
  openclawAgentId: string;
  sessionNamespace: "policy" | "safe";
  stageName: string;
  systemPrompt: string;
  timeoutMs: number;
}) {
  const sessionKey = buildStageSessionKey({
    delivery: params.delivery,
    openclawAgentId: params.openclawAgentId,
    sessionNamespace: params.sessionNamespace,
    stageName: params.stageName
  });
  const run = await params.api.runtime.subagent.run({
    extraSystemPrompt: params.systemPrompt,
    idempotencyKey: params.idempotencyKey,
    message: params.messagePayload,
    sessionKey
  });
  const wait = await params.api.runtime.subagent.waitForRun({
    runId: run.runId,
    timeoutMs: params.timeoutMs
  });
  if (wait.status !== "ok") {
    throw new Error(wait.error ?? `Stage ${params.stageName} failed with status ${wait.status}`);
  }

  const messages = await params.api.runtime.subagent.getSessionMessages({
    limit: 8,
    sessionKey
  });
  const assistantText = latestAssistantText(messages.messages);
  if (!assistantText) {
    throw new Error(`Stage ${params.stageName} returned no assistant output.`);
  }
  return assistantText;
}
