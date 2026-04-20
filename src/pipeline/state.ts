/**
 * Pipeline state management for sequential multi-skill execution.
 */

import type { UsageStats } from "../types/index.js";
import type { PipelineState, SkillStepResult } from "./types.js";

/** Empty usage stats. */
function emptyUsage(): UsageStats {
  return {
    inputTokens: 0,
    outputTokens: 0,
    costUSD: 0,
  };
}

/**
 * Create an empty initial pipeline state.
 */
export function createInitialPipelineState(options?: {
  includeFindings?: boolean;
}): PipelineState {
  return {
    completedSkills: [],
    allFindings: [],
    compactedContext: "",
    usageBySkill: {},
    compactionUsage: emptyUsage(),
    analyzedFiles: new Set(),
    includeFindings: options?.includeFindings !== false,
  };
}

/**
 * Accumulate a skill step result into the pipeline state.
 * Returns a new PipelineState (does not mutate the input).
 */
export function accumulateState(
  state: PipelineState,
  result: SkillStepResult,
  compactedContext?: string,
  compactionUsage?: UsageStats,
): PipelineState {
  const analyzedFiles = new Set(state.analyzedFiles);
  for (const [filename] of Object.entries(result.fileNotes)) {
    analyzedFiles.add(filename);
  }
  // Also add files from the report
  if (result.report.files) {
    for (const file of result.report.files) {
      analyzedFiles.add(file.filename);
    }
  }

  return {
    completedSkills: [...state.completedSkills, result.skill],
    allFindings: [...state.allFindings, ...result.findings],
    compactedContext: compactedContext ?? state.compactedContext,
    usageBySkill: {
      ...state.usageBySkill,
      [result.skill]: result.usage,
    },
    compactionUsage: compactionUsage
      ? {
          inputTokens:
            state.compactionUsage.inputTokens + compactionUsage.inputTokens,
          outputTokens:
            state.compactionUsage.outputTokens + compactionUsage.outputTokens,
          costUSD: state.compactionUsage.costUSD + compactionUsage.costUSD,
        }
      : state.compactionUsage,
    analyzedFiles,
    includeFindings: state.includeFindings,
  };
}
