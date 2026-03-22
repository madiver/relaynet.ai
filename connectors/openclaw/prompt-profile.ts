import {
  connectorPromptProfileSchema,
  type ConnectorPromptProfile,
  type PromptProfileStage
} from "./connector-messaging.js";

import promptProfileJson from "./prompt-profile.json" with { type: "json" };

const CONNECTOR_PROMPT_PROFILE = connectorPromptProfileSchema.parse(promptProfileJson);

export type { ConnectorPromptProfile, PromptProfileStage };

export function loadConnectorPromptProfile() {
  return CONNECTOR_PROMPT_PROFILE;
}

export function buildStageSystemPrompt(
  stage: PromptProfileStage,
  extraInstructions?: string | null
) {
  return [
    stage.system_prompt.trim(),
    stage.task_prompt.trim(),
    typeof extraInstructions === "string" && extraInstructions.trim()
      ? `Additional local instructions:\n${extraInstructions.trim()}`
      : null
  ]
    .filter(Boolean)
    .join("\n\n");
}
