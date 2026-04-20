# Sequential Pipeline Implementation — Status

**Status:** COMPLETE  
**Date:** 2025-07-17  
**Plan:** `PLAN-sequential-pipeline.md`  
**Skill:** `implement-sequential-pipeline`

## Summary

All 5 phases of the sequential pipeline have been implemented. The pipeline enables skills to run one-at-a-time with inter-skill context compaction, replacing the parallel `runPool()` call when `pipeline.mode === "sequential"`.

## Phase 1: Sequential Execution ✅

||

- Added `PipelineConfigSchem[rta` and `PipelineCompactionConfigSchema` to `src/config/schema.ts`
- Added `pipeline` field to `WardenConfigSchema` (mode, compactionModel, skillOrder, compaction)
- Updated `executeAllTriggers()` in `src/action/workflow/pr-workflow.ts` to branch on `config.pipeline?.mode`
- Added `[pipeline]` section to `warden.toml` with default configuration

**Files modified:** `src/config/schema.ts`, `src/action/workflow/pr-workflow.ts`, `warden.toml`

## Phase 2: Reasoning Trace Capture ✅

- Added `reasoning` field to JSON output schema in `buildHunkSystemPrompt()`
- Updated `extractFindingsJson()` to extract `reasoning` from parsed JSON
- Updated `parseHunkOutput()` → `analyzeHunk()` → `analyzeFile()` → `runSkill()` chain to propagate reasoning traces
- Added `reasoningTraces` to `SkillReportSchema`

**Files modified:** `src/sdk/prompt.ts`, `src/sdk/extract.ts`, `src/sdk/analyze.ts`, `src/sdk/types.ts`, `src/types/index.ts`

## Phase 3: Compaction Engine ✅

- Created `src/pipeline/types.ts` — `PipelineState`, `SkillStepResult`, `CompactionResult`, `CompactionOptions`
- Created `src/pipeline/state.ts` — `createInitialPipelineState()`, `accumulateState()`
- Created `src/pipeline/compactor.ts` — `compactReasoning()` with 3-tier fallback (structured → simple → skip)
- Created `src/pipeline/compactor.test.ts` — 6 unit tests covering happy path, edge cases, and fallbacks
- Created `src/pipeline/index.ts` — barrel exports

**Files created:** `src/pipeline/types.ts`, `src/pipeline/state.ts`, `src/pipeline/compactor.ts`, `src/pipeline/compactor.test.ts`, `src/pipeline/index.ts`

## Phase 4: Augmented Prompts ✅

- Added `buildAugmentedSystemPrompt()` to `src/sdk/prompt.ts` — injects prior review context, finding summaries, and dedup instructions
- Added `pipelineState` to `SkillRunnerOptions` in `src/sdk/types.ts`
- Updated `analyzeHunk()` to use augmented prompts when `options.pipelineState` exists
- Exported `buildAugmentedSystemPrompt` from `src/sdk/runner.ts`

**Files modified:** `src/sdk/prompt.ts`, `src/sdk/types.ts`, `src/sdk/analyze.ts`, `src/sdk/runner.ts`

## Phase 5: Pipeline Orchestrator ✅

- Created `src/pipeline/sequential.ts` — `executeSequentialPipeline()` and `orderTriggers()`
- Wired `executeAllTriggers()` in `pr-workflow.ts` to call `executeSequentialPipeline()` for sequential mode
- Added `pipelineState` to `TriggerExecutorDeps` in `src/action/triggers/executor.ts`
- Threaded `pipelineState` through executor → `SkillRunnerOptions` → `analyzeHunk()`
- Exported pipeline types and functions from `src/index.ts`

**Files created:** `src/pipeline/sequential.ts`  
**Files modified:** `src/action/workflow/pr-workflow.ts`, `src/action/triggers/executor.ts`, `src/index.ts`

## Verification

- **Build:** `pnpm build` — passes (exit code 0)
- **Tests:** `pnpm test` — 1321 passed, 4 skipped, 0 failed
- **Lint:** Only pre-existing `haiku.ts` error remains (not from this implementation)

## Architecture

```
warden.toml [pipeline] config
        ↓
pr-workflow.ts → executeAllTriggers()
        ↓ (mode === "sequential")
pipeline/sequential.ts → executeSequentialPipeline()
        ↓
  for each ordered trigger:
    1. buildDeps(trigger, pipelineState) → inject state
    2. executeTrigger() → executor.ts → runSkillTask()
       → analyzeHunk() uses buildAugmentedSystemPrompt()
       → reasoning traces captured through extract → analyze chain
    3. compactReasoning() → pipeline/compactor.ts
       → cheap model compresses traces (3-tier fallback)
    4. accumulateState() → immutable state transition
        ↓
  return all TriggerResult[]
```

## New Files

| File                             | Purpose                          |
| -------------------------------- | -------------------------------- |
| `src/pipeline/types.ts`          | Pipeline type definitions        |
| `src/pipeline/state.ts`          | State creation and accumulation  |
| `src/pipeline/compactor.ts`      | Inter-skill context compaction   |
| `src/pipeline/compactor.test.ts` | Compactor unit tests             |
| `src/pipeline/sequential.ts`     | Sequential pipeline orchestrator |
| `src/pipeline/index.ts`          | Barrel exports                   |
