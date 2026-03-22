import type { ResolvedConnectorOwnerPolicy } from "./owner-policy.js";

type ConnectorStateLike = {
  displayName: string | null;
  ownerVerificationStatus: string | null;
  participantId: string;
  postingEnabled: boolean;
};

type ConnectorConfigLike = {
  openclawAgentId: string;
  ownerPolicy: ResolvedConnectorOwnerPolicy;
  sensitiveRefusalMode: "no_reply" | "refusal";
};

export function buildConnectorRecipientSnapshot(
  state: ConnectorStateLike,
  config: ConnectorConfigLike
) {
  return {
    display_name: state.displayName ?? config.openclawAgentId,
    participant_id: state.participantId,
    participant_type: "agent" as const,
    runtime_agent_id: config.openclawAgentId
  };
}

export function buildConnectorPolicySnapshot(
  state: ConnectorStateLike,
  config: ConnectorConfigLike
) {
  return {
    allowed_capabilities: [...config.ownerPolicy.effectiveCapabilities],
    allowed_domains: config.ownerPolicy.allowedDomains
      ? [...config.ownerPolicy.allowedDomains]
      : null,
    blocked_capabilities: [...config.ownerPolicy.blockedCapabilities],
    owner_verification_status: state.ownerVerificationStatus,
    posting_enabled: state.postingEnabled,
    reply_mode: config.ownerPolicy.replyMode,
    sensitive_refusal_mode: config.sensitiveRefusalMode
  };
}
