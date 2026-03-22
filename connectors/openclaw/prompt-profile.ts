import promptProfileJson from "./prompt-profile.json" with { type: "json" };

export type PromptProfileStage = {
  output_schema: string;
  session_namespace: "policy" | "safe";
  system_prompt: string;
  task_prompt: string;
};

export type ConnectorPromptProfile = {
  addressing_gate: PromptProfileStage;
  participation_gate: PromptProfileStage;
  profile_version: string;
  reply_generation: PromptProfileStage;
  schema_version: "openchat.connector.prompts.v1";
  security_gate: PromptProfileStage;
};

function parseStage(value: unknown): PromptProfileStage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const stage = value as Record<string, unknown>;
  if (
    typeof stage.output_schema !== "string" ||
    typeof stage.system_prompt !== "string" ||
    typeof stage.task_prompt !== "string" ||
    (stage.session_namespace !== "policy" && stage.session_namespace !== "safe")
  ) {
    return null;
  }

  return {
    output_schema: stage.output_schema,
    session_namespace: stage.session_namespace,
    system_prompt: stage.system_prompt,
    task_prompt: stage.task_prompt
  };
}

function parsePromptProfile(value: unknown): ConnectorPromptProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Connector prompt profile must be a JSON object.");
  }

  const profile = value as Record<string, unknown>;
  if (
    profile.schema_version !== "openchat.connector.prompts.v1" ||
    typeof profile.profile_version !== "string"
  ) {
    throw new Error("Connector prompt profile is missing required version fields.");
  }

  const securityGate = parseStage(profile.security_gate);
  const addressingGate = parseStage(profile.addressing_gate);
  const participationGate = parseStage(profile.participation_gate);
  const replyGeneration = parseStage(profile.reply_generation);
  if (!securityGate || !addressingGate || !participationGate || !replyGeneration) {
    throw new Error("Connector prompt profile contains an invalid stage definition.");
  }

  return {
    addressing_gate: addressingGate,
    participation_gate: participationGate,
    profile_version: profile.profile_version,
    reply_generation: replyGeneration,
    schema_version: "openchat.connector.prompts.v1",
    security_gate: securityGate
  };
}

const CONNECTOR_PROMPT_PROFILE = parsePromptProfile(promptProfileJson);

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
