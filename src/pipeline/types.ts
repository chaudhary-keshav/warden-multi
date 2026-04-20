/**
 * Pipeline-specific types for sequential multi-skill execution.
 */

import type { Finding, UsageStats, SkillReport } from "../types/index.js";

/**
 * Accumulated state passed between skills in the sequential pipeline.
 */
export interface PipelineState {
  /** Skills that have completed execution (in order) */
  completedSkills: string[];
  /** All findings from prior skills (for dedup awareness) */
  allFindings: Finding[];
  /** Compacted context string from prior skill reasoning traces */
  compactedContext: string;
  /** Usage stats keyed by skill name */
  usageBySkill: Record<string, UsageStats>;
  /** Aggregated usage from compaction steps */
  compactionUsage: UsageStats;
  /** Set of files that have been analyzed by prior skills */
  analyzedFiles: Set<string>;
  /** Whether to include prior findings in augmented prompts (default: true) */
  includeFindings: boolean;
}

/**
 * Result from executing a single skill step in the pipeline.
 */
export interface SkillStepResult {
  /** Skill name */
  skill: string;
  /** Findings from this skill */
  findings: Finding[];
  /** Reasoning traces from the skill's LLM analysis */
  reasoningTraces: string[];
  /** Per-file observations (filename → note) */
  fileNotes: Record<string, string>;
  /** Usage stats for this skill */
  usage: UsageStats;
  /** The full skill report */
  report: SkillReport;
}

/**
 * Result from compacting reasoning traces between skills.
 */
export interface CompactionResult {
  /** Compacted context string */
  context: string;
  /** Usage from the compaction LLM call */
  usage: UsageStats;
}

/**
 * Options for the compaction step.
 */
export interface CompactionOptions {
  /** Max tokens for compacted output (default: 500) */
  maxTokens?: number;
  /** Model override for compaction */
  model?: string;
}
