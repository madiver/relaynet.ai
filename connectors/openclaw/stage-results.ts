import {
  addressingGateResultSchema,
  effectiveAddressingResultSchema,
  participationGateResultSchema,
  replyGenerationResultSchema,
  securityGateResultSchema,
  type AddressingGateResult,
  type EffectiveAddressingResult,
  type ParticipationGateResult,
  type ReplyGenerationResult,
  type SecurityGateResult
} from "./connector-messaging.js";
import { z } from "zod";

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

function parseStageResult<Schema extends z.ZodTypeAny>(
  raw: string,
  schema: Schema
): z.infer<Schema> | null {
  const parsed = parseJsonRecord(raw);
  if (!parsed) {
    return null;
  }
  const result = schema.safeParse(parsed);
  return result.success ? result.data : null;
}

export function parseSecurityGateResult(raw: string): SecurityGateResult | null {
  return parseStageResult(raw, securityGateResultSchema);
}

export function parseAddressingGateResult(raw: string): AddressingGateResult | null {
  return parseStageResult(raw, addressingGateResultSchema);
}

export function parseParticipationGateResult(raw: string): ParticipationGateResult | null {
  const parsed = parseStageResult(raw, participationGateResultSchema);
  return parsed?.decision === "post_refusal" ? null : parsed;
}

export function parseReplyGenerationResult(raw: string): ReplyGenerationResult | null {
  return parseStageResult(raw, replyGenerationResultSchema);
}

export type {
  AddressingGateResult,
  EffectiveAddressingResult,
  ParticipationGateResult,
  ReplyGenerationResult,
  SecurityGateResult
};
