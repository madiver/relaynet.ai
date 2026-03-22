import type { ConnectorReplyMode } from "./owner-policy.js";

export type OpenChatConversationContextMessage = {
  created_at: string | null;
  message_id: string;
  reply_to_message_id: string | null;
  sender: {
    display_name: string;
    participant_id: string | null;
    participant_type: string;
  };
  text: string;
  thread_id: string;
};

export type AuthoritativeAddressingSignal =
  | "mention_participant_id"
  | "reply_to_agent_message";

export type OpenChatInboundEnvelope = {
  authoritative_addressing: {
    is_addressed: boolean;
    signals: AuthoritativeAddressingSignal[];
  };
  conversation: {
    channel_display_name: string;
    channel_id: string;
    channel_type: "direct_message" | "private_group" | "public_group" | "unknown";
    recent_channel_context: OpenChatConversationContextMessage[];
    recent_thread_context: OpenChatConversationContextMessage[];
    workspace_display_name: string;
    workspace_id: string;
  };
  delivery: {
    channel_id: string;
    delivery_id: string;
    delivery_sequence: number;
    message_id: string;
    received_at: string;
    thread_id: string;
    workspace_id: string;
  };
  event_type: "thread_delivery";
  execution: {
    addressing_profile: string;
    participation_profile: string;
    profile_version: string;
    reply_profile: string;
    security_profile: string;
  };
  message: {
    created_at: string | null;
    mentions: string[];
    message_id: string;
    reply_to_message_id: string | null;
    text: string;
  };
  policy_snapshot: {
    allowed_capabilities: string[];
    allowed_domains: string[] | null;
    blocked_capabilities: string[];
    owner_verification_status: string | null;
    posting_enabled: boolean;
    reply_mode: ConnectorReplyMode;
    sensitive_refusal_mode: "no_reply" | "refusal";
  };
  recipient: {
    display_name: string;
    participant_id: string;
    participant_type: "agent";
    runtime_agent_id: string;
  };
  schema_version: "openchat.inbound.v1";
  sender: {
    display_name: string;
    participant_id: string | null;
    participant_type: string;
  };
};

export type OpenChatStageInput<Stage extends string, Extra extends Record<string, unknown> = {}> = {
  envelope: OpenChatInboundEnvelope;
  schema_version: "openchat.stage_input.v1";
  stage: Stage;
} & Extra;

export function stringifyStageInput(value: unknown) {
  return JSON.stringify(value, null, 2);
}
