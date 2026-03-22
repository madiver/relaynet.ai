export type StageConfidence = "high" | "low" | "medium";

export type SecurityGateResult = {
  confidence: StageConfidence;
  decision: "allow_process" | "deny_refusal" | "deny_silent";
  reason: string;
  reason_code: string;
};

export type AddressingGateResult = {
  confidence: StageConfidence;
  decision: "inferred_addressed" | "not_addressed" | "uncertain";
  reason: string;
  signals: string[];
};

export type EffectiveAddressingResult = {
  confidence: StageConfidence;
  decision: "addressed" | "not_addressed" | "uncertain";
  reason: string;
  signals: string[];
  source: "authoritative" | "inference";
};

export type ParticipationGateResult = {
  confidence: StageConfidence;
  decision: "no_reply" | "reply";
  reason: string;
  reason_code: string;
};

export type ReplyGenerationResult = {
  confidence: StageConfidence;
  decision: "no_reply" | "reply";
  reason: string;
  reply_text?: string;
};

function extractJsonObject(raw: string) {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

function parseJsonRecord(raw: string) {
  try {
    const parsed = JSON.parse(extractJsonObject(raw));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function parseConfidence(value: unknown): StageConfidence | null {
  return value === "high" || value === "medium" || value === "low" ? value : null;
}

function parseReason(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseSignals(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

export function parseSecurityGateResult(raw: string): SecurityGateResult | null {
  const parsed = parseJsonRecord(raw);
  if (!parsed) {
    return null;
  }

  const decision = parsed.decision;
  const confidence = parseConfidence(parsed.confidence);
  const reason = parseReason(parsed.reason);
  const reasonCode = parseReason(parsed.reason_code);
  if (
    (decision !== "allow_process" && decision !== "deny_refusal" && decision !== "deny_silent") ||
    !confidence ||
    !reason ||
    !reasonCode
  ) {
    return null;
  }

  return {
    confidence,
    decision,
    reason,
    reason_code: reasonCode
  };
}

export function parseAddressingGateResult(raw: string): AddressingGateResult | null {
  const parsed = parseJsonRecord(raw);
  if (!parsed) {
    return null;
  }

  const decision = parsed.decision;
  const confidence = parseConfidence(parsed.confidence);
  const reason = parseReason(parsed.reason);
  if (
    (decision !== "inferred_addressed" &&
      decision !== "not_addressed" &&
      decision !== "uncertain") ||
    !confidence ||
    !reason
  ) {
    return null;
  }

  return {
    confidence,
    decision,
    reason,
    signals: parseSignals(parsed.signals)
  };
}

export function parseParticipationGateResult(raw: string): ParticipationGateResult | null {
  const parsed = parseJsonRecord(raw);
  if (!parsed) {
    return null;
  }

  const decision = parsed.decision;
  const confidence = parseConfidence(parsed.confidence);
  const reason = parseReason(parsed.reason);
  const reasonCode = parseReason(parsed.reason_code);
  if ((decision !== "reply" && decision !== "no_reply") || !confidence || !reason || !reasonCode) {
    return null;
  }

  return {
    confidence,
    decision,
    reason,
    reason_code: reasonCode
  };
}

export function parseReplyGenerationResult(raw: string): ReplyGenerationResult | null {
  const parsed = parseJsonRecord(raw);
  if (!parsed) {
    return null;
  }

  const decision = parsed.decision;
  const confidence = parseConfidence(parsed.confidence);
  const reason = parseReason(parsed.reason);
  const replyText = parseReason(parsed.reply_text);
  if ((decision !== "reply" && decision !== "no_reply") || !confidence || !reason) {
    return null;
  }
  if (decision === "reply" && !replyText) {
    return null;
  }

  return {
    confidence,
    decision,
    reason,
    reply_text: replyText ?? undefined
  };
}
