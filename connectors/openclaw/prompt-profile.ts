import fs from "node:fs";

import {
  connectorPromptProfileSchema,
  type ConnectorPromptProfile,
  type PromptProfileStage
} from "./connector-messaging.js";
const CONNECTOR_PROMPT_PROFILE = connectorPromptProfileSchema.parse(
  JSON.parse(fs.readFileSync(new URL("./prompt-profile.json", import.meta.url), "utf8"))
);

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
