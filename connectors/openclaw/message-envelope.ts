import {
  openChatInboundEnvelopeSchema,
  type AuthoritativeAddressingSignal,
  type ConnectorConversationContextMessage,
  type ConnectorServerInboundEnvelope,
  type OpenChatInboundEnvelope
} from "./connector-messaging.js";

import { buildConnectorPolicySnapshot } from "./connector-state.js";
import type { ConnectorPromptProfile } from "./prompt-profile.js";
import type { ResolvedConnectorOwnerPolicy } from "./owner-policy.js";

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

export type { AuthoritativeAddressingSignal, ConnectorConversationContextMessage };
export type { ConnectorServerInboundEnvelope, OpenChatInboundEnvelope };

export type OpenChatStageInput<Stage extends string, Extra extends Record<string, unknown> = {}> = {
  envelope: OpenChatInboundEnvelope;
  schema_version: "openchat.stage_input.v1";
  stage: Stage;
} & Extra;

export function enrichInboundEnvelope(params: {
  config: ConfigLike;
  promptProfile: ConnectorPromptProfile;
  serverEnvelope: ConnectorServerInboundEnvelope;
  state: StateLike;
}): OpenChatInboundEnvelope {
  return openChatInboundEnvelopeSchema.parse({
    ...params.serverEnvelope,
    execution: {
      addressing_profile: params.promptProfile.addressing_gate.output_schema,
      participation_profile: params.promptProfile.participation_gate.output_schema,
      profile_version: params.promptProfile.profile_version,
      reply_profile: params.promptProfile.reply_generation.output_schema,
      security_profile: params.promptProfile.security_gate.output_schema
    },
    policy_snapshot: buildConnectorPolicySnapshot(params.state, params.config),
    recipient: {
      display_name:
        params.serverEnvelope.recipient.display_name ||
        params.state.displayName ||
        params.config.openclawAgentId,
      participant_id: params.serverEnvelope.recipient.participant_id,
      participant_type: params.serverEnvelope.recipient.participant_type,
      runtime_agent_id: params.config.openclawAgentId
    },
    schema_version: "openchat.inbound.v1"
  });
}

export function stringifyStageInput(value: unknown) {
  return JSON.stringify(value, null, 2);
}
