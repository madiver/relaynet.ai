import {
  buildConnectorPolicySnapshot,
  buildConnectorRecipientSnapshot
} from "./connector-state.js";
import type {
  OpenChatConversationContextMessage,
  OpenChatInboundEnvelope
} from "./message-envelope.js";
import type { ConnectorPromptProfile } from "./prompt-profile.js";
import type { ResolvedConnectorOwnerPolicy } from "./owner-policy.js";

type DeliveryLike = {
  channel_id: string;
  delivery_id: string;
  delivery_sequence: number;
  message_id: string;
  thread_id: string;
  workspace_id: string;
};

type MessageLike = {
  body?: { text?: string | null } | null;
  created_at?: string | null;
  mentions?: string[];
  message_id: string;
  reply_to_message_id?: string | null;
  sender?: {
    display_name?: string | null;
    participant_id?: string | null;
    participant_type?: string | null;
  } | null;
};

type StateLike = {
  displayName: string | null;
  ownerVerificationStatus: string | null;
  participantId: string;
  postingEnabled: boolean;
};

type ConfigLike = {
  openclawAgentId: string;
  ownerPolicy: ResolvedConnectorOwnerPolicy;
  sensitiveRefusalMode: "no_reply" | "refusal";
};

export function toConversationContextMessages(
  messages: Array<{
    createdAt: string | null;
    messageId: string;
    replyToMessageId: string | null;
    senderName: string;
    senderParticipantId?: string | null;
    senderType: string;
    text: string;
    threadId: string;
  }>
): OpenChatConversationContextMessage[] {
  return messages.map((message) => ({
    created_at: message.createdAt,
    message_id: message.messageId,
    reply_to_message_id: message.replyToMessageId,
    sender: {
      display_name: message.senderName,
      participant_id:
        typeof message.senderParticipantId === "string" ? message.senderParticipantId : null,
      participant_type: message.senderType
    },
    text: message.text,
    thread_id: message.threadId
  }));
}

export function buildInboundEnvelope(params: {
  authoritativeAddressing: OpenChatInboundEnvelope["authoritative_addressing"];
  config: ConfigLike;
  delivery: DeliveryLike;
  message: MessageLike;
  promptProfile: ConnectorPromptProfile;
  recentChannelContext: OpenChatConversationContextMessage[];
  recentThreadContext: OpenChatConversationContextMessage[];
  state: StateLike;
}): OpenChatInboundEnvelope {
  return {
    authoritative_addressing: params.authoritativeAddressing,
    conversation: {
      channel_display_name: params.delivery.channel_id,
      channel_id: params.delivery.channel_id,
      channel_type: "unknown",
      recent_channel_context: params.recentChannelContext,
      recent_thread_context: params.recentThreadContext,
      workspace_display_name: params.delivery.workspace_id,
      workspace_id: params.delivery.workspace_id
    },
    delivery: {
      channel_id: params.delivery.channel_id,
      delivery_id: params.delivery.delivery_id,
      delivery_sequence: params.delivery.delivery_sequence,
      message_id: params.delivery.message_id,
      received_at: new Date().toISOString(),
      thread_id: params.delivery.thread_id,
      workspace_id: params.delivery.workspace_id
    },
    event_type: "thread_delivery",
    execution: {
      addressing_profile: params.promptProfile.addressing_gate.output_schema,
      participation_profile: params.promptProfile.participation_gate.output_schema,
      profile_version: params.promptProfile.profile_version,
      reply_profile: params.promptProfile.reply_generation.output_schema,
      security_profile: params.promptProfile.security_gate.output_schema
    },
    message: {
      created_at:
        typeof params.message.created_at === "string" ? params.message.created_at : null,
      mentions: Array.isArray(params.message.mentions)
        ? params.message.mentions.filter(
            (value): value is string => typeof value === "string" && value.trim().length > 0
          )
        : [],
      message_id: params.message.message_id,
      reply_to_message_id:
        typeof params.message.reply_to_message_id === "string"
          ? params.message.reply_to_message_id
          : null,
      text: params.message.body?.text?.trim() || ""
    },
    policy_snapshot: buildConnectorPolicySnapshot(params.state, params.config),
    recipient: buildConnectorRecipientSnapshot(params.state, params.config),
    schema_version: "openchat.inbound.v1",
    sender: {
      display_name: params.message.sender?.display_name?.trim() || "Unknown sender",
      participant_id:
        typeof params.message.sender?.participant_id === "string"
          ? params.message.sender.participant_id
          : null,
      participant_type: params.message.sender?.participant_type?.trim() || "participant"
    }
  };
}
