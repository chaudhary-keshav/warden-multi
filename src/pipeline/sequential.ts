/**
 * Sequential Pipeline Orchestrator
 *
 * Runs skills one-at-a-time with inter-skill context compaction,
 * replacing the parallel runPool() call in executeAllTriggers()
 * when pipeline.mode === "sequential".
 */

import type { ResolvedTrigger } from "../config/loader.js";
import type { WardenConfig } from "../config/schema.js";
import type { EventContext } from "../types/index.js";
import type { LLMProvider } from "../providers/types.js";
import type {
  TriggerResult,
  TriggerExecutorDeps,
} from "../action/triggers/executor.js";
import { executeTrigger } from "../action/triggers/executor.js";
import { createInitialPipelineState, accumulateState } from "./state.js";
import { compactReasoning } from "./compactor.js";
import type { PipelineState, SkillStepResult } from "./types.js";

/**
 * Order triggers according to the configured skillOrder.
 * Triggers not in skillOrder are appended at the end in their original order.
 */
export function orderTriggers(
  triggers: ResolvedTrigger[],
  skillOrder?: string[],
): ResolvedTrigger[] {
  if (!skillOrder || skillOrder.length === 0) {
    return triggers;
  }

  const ordered: ResolvedTrigger[] = [];
  const remaining = [...triggers];

  for (const skillName of skillOrder) {
    const index = remaining.findIndex(
      (t) => t.skill === skillName || t.name === skillName,
    );
    if (index !== -1) {
      const [removed] = remaining.splice(index, 1);
      ordered.push(removed as ResolvedTrigger);
    }
  }

  // Append any triggers not in skillOrder
  ordered.push(...remaining);

  return ordered;
}

/**
 * Convert a TriggerResult into a SkillStepResult for pipeline state accumulation.
 */
function toSkillStepResult(result: TriggerResult): SkillStepResult | null {
  if (!result.report) return null;

  const fileNotes: Record<string, string> = {};
  if (result.report.files) {
    for (const file of result.report.files) {
      fileNotes[file.filename] =
        `${file.findingCount} findings, ${file.durationMs ?? 0}ms`;
    }
  }

  return {
    skill: result.report.skill,
    findings: result.report.findings,
    reasoningTraces: result.report.reasoningTraces ?? [],
    fileNotes,
    usage: result.report.usage ?? {
      inputTokens: 0,
      outputTokens: 0,
      costUSD: 0,
    },
    report: result.report,
  };
}

/**
 * Execute triggers sequentially with inter-skill context compaction.
 *
 * For each trigger:
 * 1. Inject pipeline state into runner options (augmented prompts)
 * 2. Execute the trigger via executeTrigger()
 * 3. Compact reasoning traces from the result
 * 4. Accumulate state for the next trigger
 */
export async function executeSequentialPipeline(
  triggers: ResolvedTrigger[],
  context: EventContext,
  config: WardenConfig,
  provider: LLMProvider,
  buildDeps: (
    trigger: ResolvedTrigger,
    pipelineState?: PipelineState,
  ) => TriggerExecutorDeps,
): Promise<TriggerResult[]> {
  const compactionEnabled = config.pipeline?.compaction?.enabled !== false;
  const compactionModel = config.pipeline?.compactionModel;
  const maxTokens = config.pipeline?.compaction?.maxTokens;
  const includeFindings = config.pipeline?.compaction?.includeFindings;

  // Order triggers by configured skill order
  const orderedTriggers = orderTriggers(triggers, config.pipeline?.skillOrder);

  let state = createInitialPipelineState({ includeFindings });
  const results: TriggerResult[] = [];

  for (const trigger of orderedTriggers) {
    // Build deps with current pipeline state for augmented prompts
    const deps = buildDeps(trigger, state);

    // Inject pipeline state into runner options via the deps
    // The executor will pass these through to runSkillTask → analyzeHunk
    const result = await executeTrigger(trigger, deps);
    results.push(result);

    // Accumulate state for the next trigger
    if (compactionEnabled) {
      const stepResult = toSkillStepResult(result);
      if (stepResult) {
        // Run compaction on the result's reasoning traces
        try {
          const compactionResult = await compactReasoning(
            stepResult,
            state.compactedContext,
            provider,
            { maxTokens, model: compactionModel },
          );
          state = accumulateState(
            state,
            stepResult,
            compactionResult.context,
            compactionResult.usage,
          );
        } catch {
          // If compaction fails, still accumulate state without compacted context
          state = accumulateState(state, stepResult);
        }
      }
    }
  }

  return results;
}
