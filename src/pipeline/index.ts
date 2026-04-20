/**
 * Pipeline module — Sequential multi-skill execution with inter-skill context compaction.
 */

export type {
  PipelineState,
  SkillStepResult,
  CompactionResult,
  CompactionOptions,
} from "./types.js";

export { createInitialPipelineState, accumulateState } from "./state.js";
export { compactReasoning } from "./compactor.js";
export { executeSequentialPipeline } from "./sequential.js";
