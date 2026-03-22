import { z } from "zod";

const participantTypeValues = ["human", "agent", "system"] as const;

export const connectorReplyModeValues = ["direct_only", "guided"] as const;
export const authoritativeAddressingSignalValues = [
  "mention_participant_id",
  "reply_to_agent_message",
  "direct_message_channel"
] as const;
export const stageConfidenceValues = ["high", "low", "medium"] as const;

export const connectorConversationContextMessageSchema = z
  .object({
    created_at: z.string().datetime().nullable(),
    message_id: z.string(),
    reply_to_message_id: z.string().nullable(),
    sender: z.object({
      display_name: z.string(),
      participant_id: z.string().nullable(),
      participant_type: z.enum(participantTypeValues)
    }),
    text: z.string(),
    thread_id: z.string()
  })
  .strict();

export const connectorDeliveryEnvelopePayloadSchema = z
  .object({
    channel_id: z.string(),
    delivery_id: z.string(),
    delivery_sequence: z.number().int().nonnegative(),
    message_id: z.string(),
    received_at: z.string().datetime(),
    thread_id: z.string(),
    workspace_id: z.string()
  })
  .strict();

export const connectorAuthoritativeAddressingSchema = z
  .object({
    is_addressed: z.boolean(),
    signals: z.array(z.enum(authoritativeAddressingSignalValues))
  })
  .strict();

export const connectorServerRecipientSchema = z
  .object({
    display_name: z.string(),
    participant_id: z.string(),
    participant_type: z.enum(participantTypeValues),
    runtime_agent_id: z.string().nullable().optional()
  })
  .strict();

export const connectorMessagePayloadSchema = z
  .object({
    created_at: z.string().datetime().nullable(),
    mentions: z.array(z.string()),
    message_id: z.string(),
    reply_to_message_id: z.string().nullable(),
    text: z.string()
  })
  .strict();

export const connectorConversationPayloadSchema = z
  .object({
    channel_display_name: z.string(),
    channel_id: z.string(),
    channel_type: z.enum(["direct_message", "private_group", "public_group", "unknown"]),
    recent_channel_context: z.array(connectorConversationContextMessageSchema),
    recent_thread_context: z.array(connectorConversationContextMessageSchema),
    workspace_display_name: z.string(),
    workspace_id: z.string()
  })
  .strict();

export const connectorSenderPayloadSchema = z
  .object({
    display_name: z.string(),
    participant_id: z.string().nullable(),
    participant_type: z.enum(participantTypeValues)
  })
  .strict();

export const connectorServerInboundEnvelopeSchema = z
  .object({
    authoritative_addressing: connectorAuthoritativeAddressingSchema,
    conversation: connectorConversationPayloadSchema,
    delivery: connectorDeliveryEnvelopePayloadSchema,
    event_type: z.literal("thread_delivery"),
    message: connectorMessagePayloadSchema,
    recipient: connectorServerRecipientSchema,
    schema_version: z.literal("openchat.server_inbound.v1"),
    sender: connectorSenderPayloadSchema
  })
  .strict();

export const connectorPolicySnapshotSchema = z
  .object({
    allowed_capabilities: z.array(z.string()),
    allowed_domains: z.array(z.string()).nullable(),
    blocked_capabilities: z.array(z.string()),
    owner_verification_status: z.string().nullable(),
    posting_enabled: z.boolean(),
    reply_mode: z.enum(connectorReplyModeValues),
    sensitive_refusal_mode: z.enum(["no_reply", "refusal"])
  })
  .strict();

export const connectorExecutionSnapshotSchema = z
  .object({
    addressing_profile: z.string(),
    participation_profile: z.string(),
    profile_version: z.string(),
    reply_profile: z.string(),
    security_profile: z.string()
  })
  .strict();

export const openChatInboundEnvelopeSchema = connectorServerInboundEnvelopeSchema
  .extend({
    execution: connectorExecutionSnapshotSchema,
    policy_snapshot: connectorPolicySnapshotSchema,
    recipient: connectorServerRecipientSchema.extend({
      runtime_agent_id: z.string()
    }),
    schema_version: z.literal("openchat.inbound.v1")
  })
  .strict();

export const securityGateResultSchema = z
  .object({
    confidence: z.enum(stageConfidenceValues),
    decision: z.enum(["allow_process", "deny_refusal", "deny_silent"]),
    reason: z.string().min(1),
    reason_code: z.string().min(1)
  })
  .strict();

export const addressingGateResultSchema = z
  .object({
    confidence: z.enum(stageConfidenceValues),
    decision: z.enum(["inferred_addressed", "not_addressed", "uncertain"]),
    reason: z.string().min(1),
    signals: z.array(z.string())
  })
  .strict();

export const effectiveAddressingResultSchema = z
  .object({
    confidence: z.enum(stageConfidenceValues),
    decision: z.enum(["addressed", "not_addressed", "uncertain"]),
    reason: z.string().min(1),
    signals: z.array(z.string()),
    source: z.enum(["authoritative", "inference"])
  })
  .strict();

export const participationGateResultSchema = z
  .object({
    confidence: z.enum(stageConfidenceValues),
    decision: z.enum(["no_reply", "post_refusal", "reply"]),
    reason: z.string().min(1),
    reason_code: z.string().min(1)
  })
  .strict();

export const replyGenerationResultSchema = z
  .object({
    confidence: z.enum(stageConfidenceValues),
    decision: z.enum(["no_reply", "reply"]),
    reason: z.string().min(1),
    reply_text: z.string().min(1).optional()
  })
  .strict();

export const connectorDeterministicSecurityOverrideSchema = z
  .object({
    command_terms: z.array(z.string().min(1)),
    direct_phrases: z.array(z.string().min(1)),
    protected_terms: z.array(z.string().min(1))
  })
  .strict();

export const connectorDeterministicSecurityCategorySchema = z
  .object({
    reason: z.string().min(1),
    reason_code: z.string().min(1),
    target_terms: z.array(z.string().min(1)).min(1)
  })
  .strict();

export const connectorDeterministicSecurityPolicySchema = z
  .object({
    explicit_request_terms: z.array(z.string().min(1)).min(1),
    local_path_inspection_terms: z.array(z.string().min(1)).min(1),
    override_attempt: connectorDeterministicSecurityOverrideSchema,
    passive_artifact_labels: z.array(z.string().min(1)).min(1),
    sensitive_categories: z.array(connectorDeterministicSecurityCategorySchema).min(1)
  })
  .strict();

export const connectorPromptProfileStageSchema = z
  .object({
    output_schema: z.string().min(1),
    session_namespace: z.enum(["policy", "safe"]),
    system_prompt: z.string(),
    task_prompt: z.string()
  })
  .strict();

export const connectorSecurityPromptProfileStageSchema = connectorPromptProfileStageSchema
  .extend({
    deterministic_policy: connectorDeterministicSecurityPolicySchema
  })
  .strict();

export const connectorPromptProfileSchema = z
  .object({
    addressing_gate: connectorPromptProfileStageSchema,
    participation_gate: connectorPromptProfileStageSchema,
    profile_version: z.string().min(1),
    reply_generation: connectorPromptProfileStageSchema,
    schema_version: z.literal("openchat.connector.prompts.v1"),
    security_gate: connectorSecurityPromptProfileStageSchema
  })
  .strict();

export type ConnectorConversationContextMessage = z.infer<
  typeof connectorConversationContextMessageSchema
>;
export type AuthoritativeAddressingSignal = (typeof authoritativeAddressingSignalValues)[number];
export type ConnectorServerInboundEnvelope = z.infer<typeof connectorServerInboundEnvelopeSchema>;
export type OpenChatInboundEnvelope = z.infer<typeof openChatInboundEnvelopeSchema>;
export type SecurityGateResult = z.infer<typeof securityGateResultSchema>;
export type AddressingGateResult = z.infer<typeof addressingGateResultSchema>;
export type EffectiveAddressingResult = z.infer<typeof effectiveAddressingResultSchema>;
export type ParticipationGateResult = z.infer<typeof participationGateResultSchema>;
export type ReplyGenerationResult = z.infer<typeof replyGenerationResultSchema>;
export type PromptProfileStage = z.infer<typeof connectorPromptProfileStageSchema>;
export type ConnectorDeterministicSecurityPolicy = z.infer<
  typeof connectorDeterministicSecurityPolicySchema
>;
export type ConnectorPromptProfile = z.infer<typeof connectorPromptProfileSchema>;
