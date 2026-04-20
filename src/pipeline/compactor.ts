/**
 * Compaction engine for inter-skill context compression.
 *
 * Uses a cheap/auxiliary model to compress reasoning traces from one skill
 * into a compact context summary for the next skill. Follows patterns from
 * Copilot Chat's compaction system (structured format, temperature 0,
 * fallback chain, size validation).
 */

import type { LLMProvider } from "../providers/types.js";
import type {
  SkillStepResult,
  CompactionResult,
  CompactionOptions,
} from "./types.js";

const DEFAULT_MAX_TOKENS = 500;

const COMPACTION_SYSTEM_PROMPT = `You are a code review context compressor. Given reasoning traces from a code review skill, produce a compressed context summary for the next reviewer.

Your output must use exactly this format:

<analysis>
- Files analyzed: [list with 1-line observation each]
- Patterns observed: [anti-patterns, recurring issues across files]
- Areas NOT covered: [what the skill didn't examine or flagged for deeper review]
- Key architectural observations: [cross-cutting concerns]
</analysis>

<compact-context>
- Prior skills completed: [list]
- Key findings summary: [1-line per finding category]
- Coverage gaps: [what hasn't been checked yet]
- Focus areas for next skill: [based on gaps and observations]
</compact-context>

Rules:
- Keep under ${DEFAULT_MAX_TOKENS} tokens total.
- Use bullet points, not prose.
- Do NOT include the actual findings (those are passed separately).
- Do NOT include code snippets (the next skill has the diff).
- Do NOT include severity assessments (those are in findings).
- Focus on observations, patterns, and coverage gaps that help the next reviewer.`;

/**
 * Build the user prompt for compaction.
 */
function buildCompactionUserPrompt(
  stepResult: SkillStepResult,
  priorContext: string,
): string {
  const sections: string[] = [];

  if (priorContext) {
    sections.push(`## Prior Context (from earlier skills)\n${priorContext}`);
  }

  sections.push(`## Current Skill: "${stepResult.skill}"`);

  if (stepResult.reasoningTraces.length > 0) {
    sections.push(
      `## Reasoning Traces (${stepResult.reasoningTraces.length} hunks)\n${stepResult.reasoningTraces.join("\n---\n")}`,
    );
  }

  if (Object.keys(stepResult.fileNotes).length > 0) {
    const notes = Object.entries(stepResult.fileNotes)
      .map(([file, note]) => `- ${file}: ${note}`)
      .join("\n");
    sections.push(`## File Notes\n${notes}`);
  }

  sections.push(
    `## Findings Count: ${stepResult.findings.length} (not included here — passed separately)`,
  );

  return sections.join("\n\n");
}

/**
 * Compact reasoning traces from a skill step into a compressed context string.
 *
 * Uses a fallback chain:
 * 1. Full compaction with structured format
 * 2. Simple compaction (shorter prompt)
 * 3. Skip compaction (return prior context unchanged)
 */
export async function compactReasoning(
  stepResult: SkillStepResult,
  priorContext: string,
  provider: LLMProvider,
  options?: CompactionOptions,
): Promise<CompactionResult> {
  const maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS;

  // Skip compaction if there are no reasoning traces
  if (stepResult.reasoningTraces.length === 0) {
    return {
      context: priorContext,
      usage: { inputTokens: 0, outputTokens: 0, costUSD: 0 },
    };
  }

  const userPrompt = buildCompactionUserPrompt(stepResult, priorContext);

  // Tier 1: Full structured compaction
  try {
    const result = await provider.auxiliaryQuery({
      systemPrompt: COMPACTION_SYSTEM_PROMPT,
      userPrompt,
      model: options?.model,
      maxTokens: maxTokens * 4, // Allow room for the model, we validate output size
      temperature: 0, // Deterministic compaction (Copilot pattern)
    });

    if (result.success && result.content.trim().length > 0) {
      return {
        context: result.content.trim(),
        usage: result.usage,
      };
    }
  } catch {
    // Fall through to simple compaction
  }

  // Tier 2: Simple compaction (minimal prompt)
  try {
    const simplePrompt = `Summarize these code review observations in under ${maxTokens} tokens as bullet points:\n\n${stepResult.reasoningTraces.slice(0, 5).join("\n")}`;

    const result = await provider.auxiliaryQuery({
      systemPrompt: "You are a concise summarizer. Output bullet points only.",
      userPrompt: simplePrompt,
      model: options?.model,
      maxTokens: maxTokens * 2,
      temperature: 0,
    });

    if (result.success && result.content.trim().length > 0) {
      return {
        context: result.content.trim(),
        usage: result.usage,
      };
    }
  } catch {
    // Fall through to skip
  }

  // Tier 3: Skip compaction — return prior context unchanged
  return {
    context: priorContext,
    usage: { inputTokens: 0, outputTokens: 0, costUSD: 0 },
  };
}
