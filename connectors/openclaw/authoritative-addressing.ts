import type {
  AuthoritativeAddressingSignal,
  ConnectorConversationContextMessage
} from "./message-envelope.js";

type DeliveryLike = {
  channel_type?: string | null;
  message_id: string;
};

type MessageLike = {
  mentions?: string[];
  reply_to_message_id?: string | null;
};

export function resolveAuthoritativeAddressing(input: {
  delivery: DeliveryLike;
  message: MessageLike;
  recentThreadContext: ConnectorConversationContextMessage[];
  recipientParticipantId: string;
}) {
  const signals: AuthoritativeAddressingSignal[] = [];
  if (input.delivery.channel_type === "direct_message") {
    signals.push("direct_message_channel");
  }
  if (Array.isArray(input.message.mentions)) {
    const normalizedMentions = new Set(
      input.message.mentions
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    );
    if (normalizedMentions.has(input.recipientParticipantId)) {
      signals.push("mention_participant_id");
    }
  }

  if (typeof input.message.reply_to_message_id === "string" && input.message.reply_to_message_id) {
    const repliedToAgentMessage = input.recentThreadContext.some(
      (entry) =>
        entry.message_id === input.message.reply_to_message_id &&
        entry.sender.participant_id === input.recipientParticipantId
    );
    if (repliedToAgentMessage) {
      signals.push("reply_to_agent_message");
    }
  }

  return {
    is_addressed: signals.length > 0,
    signals
  };
}
