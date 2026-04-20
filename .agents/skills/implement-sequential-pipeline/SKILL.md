---
name: implement-sequential-pipeline
description: "Implementation guide for Warden's sequential pipeline with inter-skill context compaction. Covers all 5 phases: sequential execution, reasoning capture, compaction engine, augmented prompts, and smart ordering. References PLAN-sequential-pipeline.md and RESEARCH-copilot-compaction.md."
allowed-tools: Read Grep Glob Write Edit mcp_codetrellis_get_context_for_file mcp_codetrellis_get_best_practices mcp_codetrellis_get_sections mcp_codetrellis_get_filtered_logic mcp_codetrellis_search_matrix mcp_codetrellis_get_cache_stats
---

You are a senior TypeScript engineer implementing a sequential multi-step code review pipeline for Warden. You have two reference documents that define the full architecture:

1. **Architecture Plan**: `PLAN-sequential-pipeline.md` (root of repo)
2. **Copilot Compaction Research**: `RESEARCH-copilot-compaction.md` (root of repo)

**Read both documents in full before starting any implementation.**

## Project Context

Warden is a multi-provider code review agent (`@sentry/warden-multi`). It currently runs all skills in **parallel** via `runPool()`, which causes 429 rate limit failures when multiple skills compete for the same API key's TPM budget. The fix is a **sequential pipeline** where skills run one-at-a-time, passing compacted context between them.

### Key Conventions (MUST follow)

- TypeScript strict mode, ESM modules (`"type": "module"`)
- Zod for runtime validation
- `export type` for type-only exports (Bun compatibility)
- Vitest for tests, co-located (`foo.ts` → `foo.test.ts`)
- Use `pnpm` (not npm)
- Verify: `pnpm lint && pnpm build && pnpm test`

---

## Repository Map — Files You MUST Read Before Each Phase

### Orchestration Layer (WHERE pipeline executes)

| File                                 | Key Functions                                                                                        | What It Does                                                                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `src/action/workflow/pr-workflow.ts` | `executeAllTriggers()` [L325], `initializeWorkflow()` [L118], `postReviewsAndTrackFailures()` [L360] | **PRIMARY TARGET**: orchestrates all triggers in parallel via `runPool(matchedTriggers, matchedTriggers.length)`. Change to sequential. |
| `src/action/triggers/executor.ts`    | `executeTrigger()` [L110], `TriggerResult` [L83]                                                     | Executes a single trigger: creates check run, runs skill task, updates check. Pipeline must still call this per-skill.                  |
| `src/action/workflow/schedule.ts`    | `runScheduleWorkflow()`                                                                              | Already sequential — use as reference pattern.                                                                                          |

### Analysis Layer (HOW skills analyze code)

| File                 | Key Functions                                                                                              | What It Does                                                                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/sdk/analyze.ts` | `runSkill()` [L991], `analyzeFile()` [L874], `analyzeHunk()` [L528], `executeQuery()`, `parseHunkOutput()` | Core analysis pipeline. `analyzeHunk()` builds prompts, calls LLM, parses findings. **Reasoning traces** must be extracted from `executeQuery()` responses here. |
| `src/sdk/prompt.ts`  | `buildHunkSystemPrompt()` [L27], `buildHunkUserPrompt()` [L76], `PRPromptContext`                          | Prompt construction. **Augmented system prompt** must be injected here for skills after the first.                                                               |
| `src/sdk/prepare.ts` | `prepareFiles()`                                                                                           | Parses patches into hunks. No changes needed, but understand the data flow.                                                                                      |

### Dual Code Path (BOTH must be updated)

| File                      | Key Functions                                     | Why                                                                                      |
| ------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `src/sdk/analyze.ts`      | `runSkill()`                                      | SDK/Action code path — builds `SkillReport`                                              |
| `src/cli/output/tasks.ts` | `runSkillTask()` [L170], `runSkillTasks()` [L727] | CLI code path — builds `SkillReport` independently. **Must stay in sync with SDK path.** |

### Types (WHAT data structures exist)

| File                     | Key Types                                                                                              | Notes                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `src/types/index.ts`     | `Finding`, `SkillReport`, `UsageStats`, `Severity`, `Confidence`, `EventContext`, `PullRequestContext` | All shared types. New pipeline types go here.                 |
| `src/providers/types.ts` | `LLMProvider`, `LLMQueryOptions`, `LLMQueryResult`, `McpServerConfig`                                  | Provider interface. Compaction queries use `LLMQueryOptions`. |

### Providers (HOW LLM queries work)

| File                          | Class              | Default Model              | Auxiliary Model                   |
| ----------------------------- | ------------------ | -------------------------- | --------------------------------- |
| `src/providers/openai.ts`     | `OpenAIProvider`   | `gpt-5.2`                  | `gpt-4o-mini`                     |
| `src/providers/claude.ts`     | `ClaudeProvider`   | `claude-sonnet-4-20250514` | `claude-haiku-4-5`                |
| `src/providers/gemini.ts`     | `GeminiProvider`   | `gemini-3.1-pro-preview`   | `gemini-2.5-flash`                |
| `src/providers/index.ts`      | `createProvider()` | —                          | Factory function                  |
| `src/providers/mcp-client.ts` | `McpClientManager` | —                          | MCP tool routing to all providers |

### Configuration (WHERE settings live)

| File                   | Key Schemas                                                                      | Notes                                                  |
| ---------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `src/config/schema.ts` | `WardenConfigSchema` [L349], `DefaultsSchema` [L215], `SkillConfigSchema` [L162] | Add `PipelineConfigSchema` here.                       |
| `src/config/loader.ts` | `loadWardenConfig()`                                                             | Config loading — must handle new `[pipeline]` section. |
| `warden.toml`          | —                                                                                | User-facing config. Add `[pipeline]` section.          |

### Utilities

| File                 | Key Exports              | Notes                                                                                                       |
| -------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `src/utils/async.ts` | `runPool()`, `Semaphore` | Current parallel execution utility. Sequential pipeline replaces `runPool` usage in `executeAllTriggers()`. |
| `src/index.ts`       | All public exports       | New pipeline types and functions must be exported here.                                                     |

---

## Implementation Phases

Execute these phases in order. Each phase is independently testable and shippable.

### Phase 1: Sequential Execution (No Compaction)

**Goal**: Run skills one-at-a-time instead of all-at-once. Eliminates 429 rate limits.

**Read first**:

- `PLAN-sequential-pipeline.md` → "Phase 1: Sequential Execution" section
- `src/action/workflow/pr-workflow.ts` → `executeAllTriggers()` function
- `src/utils/async.ts` → `runPool()` implementation
- `src/config/schema.ts` → `WardenConfigSchema`

**Changes**:

1. **`src/config/schema.ts`** — Add pipeline config:

   ```typescript
   const PipelineConfigSchema = z
     .object({
       mode: z.enum(["sequential", "parallel"]).default("parallel"),
     })
     .optional();
   ```

   Add to `WardenConfigSchema` as `pipeline?: PipelineConfigSchema`.

2. **`src/action/workflow/pr-workflow.ts`** — In `executeAllTriggers()`, check `config.pipeline?.mode`:
   - If `"sequential"`: loop triggers with `for...of` instead of `runPool(triggers, triggers.length)`
   - If `"parallel"` (default): keep current behavior
   - Each iteration still calls `executeTrigger()` via the existing executor

3. **`warden.toml`** — Add:

   ```toml
   [pipeline]
   mode = "sequential"
   ```

4. **Test**: Run `pnpm test` to verify no regressions. Create a test in `src/action/workflow/pr-workflow.test.ts` that verifies sequential execution order.

**Verify**: `pnpm lint && pnpm build && pnpm test`

---

### Phase 2: Reasoning Trace Capture

**Goal**: Extract reasoning text from LLM responses alongside findings.

**Read first**:

- `PLAN-sequential-pipeline.md` → "Reasoning Trace Capture" section (Option B recommended)
- `src/sdk/analyze.ts` → `analyzeHunk()`, `parseHunkOutput()`
- `src/sdk/prompt.ts` → `buildHunkSystemPrompt()` (output format spec)
- `src/types/index.ts` → `HunkAnalysisResult` if it exists, or find equivalent

**Changes**:

1. **`src/types/index.ts`** — Add `reasoning?: string` to the hunk analysis result type.

2. **`src/sdk/prompt.ts`** — In `buildHunkSystemPrompt()`, add `reasoning` field to the JSON output schema:

   ```
   {
     "findings": [...],
     "reasoning": "Brief summary of analysis approach and key observations"
   }
   ```

3. **`src/sdk/analyze.ts`** — In `parseHunkOutput()`, extract the `reasoning` field from parsed JSON. Store it in the result object.

4. **`src/sdk/analyze.ts`** — In `analyzeFile()`, collect reasoning traces from all hunk results into an array.

5. **Both code paths**: Ensure `runSkill()` (SDK path) and `runSkillTask()` (CLI path in `src/cli/output/tasks.ts`) both propagate reasoning traces upward.

**Verify**: `pnpm lint && pnpm build && pnpm test`

---

### Phase 3: Compaction Engine

**Goal**: Build the cheap-model compaction step that compresses reasoning between skills.

**Read first**:

- `PLAN-sequential-pipeline.md` → "Compaction Engine" section, "Compaction Prompt Template"
- `RESEARCH-copilot-compaction.md` → Section 5 ("Summarization Prompt"), Section 9 ("Recommended Changes")
- `src/providers/types.ts` → `LLMQueryOptions`, `LLMQueryResult`
- `src/providers/index.ts` → `createProvider()`

**Reference (Copilot patterns to adopt)**:

- **Structured format**: Use `<analysis>` + `<compact-context>` tags (from RESEARCH Section 9A)
- **Temperature 0**: Deterministic compaction (from RESEARCH Section 3)
- **Size validation**: Reject summaries exceeding budget (from RESEARCH Section 3)
- **Fallback chain**: Full → Simple → Skip (from RESEARCH Section 3)

**New files**:

1. **`src/pipeline/state.ts`** — `PipelineState` interface and helpers:

   ```typescript
   export interface PipelineState {
     completedSkills: string[];
     allFindings: Finding[];
     compactedContext: string;
     usageBySkill: Record<string, UsageStats>;
     compactionUsage: UsageStats;
     analyzedFiles: Set<string>;
   }

   export function createInitialPipelineState(): PipelineState { ... }
   export function accumulateState(state: PipelineState, result: SkillStepResult): PipelineState { ... }
   ```

2. **`src/pipeline/compactor.ts`** — Compaction logic:

   ```typescript
   export async function compactReasoning(
     stepResult: SkillStepResult,
     priorContext: string,
     provider: LLMProvider,
     options?: CompactionOptions,
   ): Promise<CompactionResult> { ... }
   ```

   - Uses the provider's `auxiliaryQuery()` or `query()` with the auxiliary model (gpt-4o-mini / claude-haiku / gemini-flash)
   - Compaction prompt from PLAN Section D.E
   - Max 500 tokens output
   - Validate output size; re-compact if too large (RESEARCH Section 9B)

3. **`src/pipeline/types.ts`** — Pipeline-specific types:

   ```typescript
   export interface SkillStepResult {
     skill: string;
     findings: Finding[];
     reasoningTraces: string[];
     fileNotes: Record<string, string>;
     usage: UsageStats;
     report: SkillReport;
   }

   export interface CompactionResult {
     context: string;
     usage: UsageStats;
   }

   export interface CompactionOptions {
     maxTokens?: number; // Default: 500
     model?: string; // Override compaction model
   }
   ```

4. **`src/pipeline/index.ts`** — Barrel export.

**Verify**: `pnpm lint && pnpm build && pnpm test`. Write unit tests in `src/pipeline/compactor.test.ts` with mocked provider.

---

### Phase 4: Augmented Prompts

**Goal**: Inject accumulated context into each skill's system prompt after the first skill.

**Read first**:

- `PLAN-sequential-pipeline.md` → Section D ("Augmented System Prompt")
- `src/sdk/prompt.ts` → `buildHunkSystemPrompt()`, `buildHunkUserPrompt()`
- `src/sdk/analyze.ts` → how prompts are passed to `executeQuery()`

**Changes**:

1. **`src/sdk/prompt.ts`** — Add `buildAugmentedSystemPrompt()`:

   ```typescript
   export function buildAugmentedSystemPrompt(
     skillPrompt: string,
     state: PipelineState,
   ): string {
     if (state.completedSkills.length === 0) return skillPrompt;
     return `${skillPrompt}\n\n## Prior Review Context\n...`;
   }
   ```

   Format per PLAN Section D. Include:
   - List of completed skills
   - Compacted context observations
   - Finding summaries (title + severity only, not full descriptions)
   - Instructions to avoid duplicates and focus on this skill's domain

2. **`src/sdk/analyze.ts`** — Thread `PipelineState` through the call chain:
   - `analyzeHunk()` receives pipeline state via options
   - If state exists, use `buildAugmentedSystemPrompt()` instead of `buildHunkSystemPrompt()`

3. **`src/cli/output/tasks.ts`** — Same threading for CLI path. `runSkillTask()` must accept optional `PipelineState`.

**Verify**: `pnpm lint && pnpm build && pnpm test`

---

### Phase 5: Sequential Pipeline Orchestrator

**Goal**: Wire everything together — sequential execution with compaction between each skill.

**Read first**:

- `PLAN-sequential-pipeline.md` → Section C ("Pipeline Execution Engine"), "Skill Execution Order"
- `RESEARCH-copilot-compaction.md` → Section 8 ("Applicability to Warden")
- `src/action/workflow/pr-workflow.ts` → `executeAllTriggers()`
- `src/action/triggers/executor.ts` → `executeTrigger()`

**New files**:

1. **`src/pipeline/sequential.ts`** — Main orchestrator:

   ```typescript
   export async function executeSequentialPipeline(
     orderedTriggers: ResolvedTrigger[],
     context: EventContext,
     config: WardenConfig,
     inputs: ActionInputs,
     octokit: Octokit,
   ): Promise<TriggerResult[]> { ... }
   ```

   This function replaces the `runPool()` call in `executeAllTriggers()` when `pipeline.mode === "sequential"`. It:
   - Creates initial `PipelineState`
   - Loops through triggers in configured order
   - After each skill: captures reasoning, runs compaction, accumulates state
   - Passes augmented prompts to subsequent skills
   - Updates check runs after each skill (real-time progress)
   - Handles per-skill errors (skip to next, don't abort pipeline)

2. **`src/config/schema.ts`** — Expand pipeline config:

   ```toml
   [pipeline]
   mode = "sequential"
   compactionModel = "gpt-4o-mini"
   skillOrder = ["find-warden-bugs", "architecture-review", "testing-guidelines", "code-simplifier", "codetrellis-aware-review"]

   [pipeline.compaction]
   enabled = true
   maxTokens = 500
   includeFindings = true
   ```

3. **`src/action/workflow/pr-workflow.ts`** — Update `executeAllTriggers()` to dispatch:
   ```typescript
   if (config.pipeline?.mode === "sequential") {
     return executeSequentialPipeline(orderedTriggers, context, config, inputs, octokit);
   }
   return runPool(matchedTriggers, matchedTriggers.length, ...); // existing parallel
   ```

**Skill order** (narrow → broad):

1. `find-warden-bugs` — domain-specific, catches known patterns
2. `architecture-review` — structural, informed by bug findings
3. `testing-guidelines` — test coverage, knows which code has issues
4. `code-simplifier` — avoids conflicting with prior findings
5. `codetrellis-aware-review` — MCP-powered, full picture from all prior skills

**Verify**: `pnpm lint && pnpm build && pnpm test`. Integration test that mocks provider and verifies sequential execution with compaction.

---

## Reference: Copilot Chat Compaction Patterns

These patterns from `microsoft/vscode-copilot-chat` (MIT licensed) inform our implementation. The full analysis is in `RESEARCH-copilot-compaction.md`.

### Patterns to Adopt

| Pattern                             | Copilot Source                                         | Our Implementation                                               |
| ----------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------- |
| **Structured summary format**       | `<analysis>` + `<summary>` with required sections      | Use `<analysis>` + `<compact-context>` tags in compaction prompt |
| **Summary size validation**         | Reject if `summarySize > effectiveBudget`              | Validate compacted context ≤ 500 tokens                          |
| **Temperature 0 for summarization** | `temperature: 0, stream: false` in summarization call  | Same — deterministic compaction                                  |
| **Fallback chain**                  | Full → Simple → No summarization                       | Full compaction → Minimal compaction → Skip                      |
| **tool_choice: 'none'**             | Summarization call includes tool defs but blocks calls | Compaction call: single-turn, no tools                           |
| **Snapshot isolation**              | Deep-copy context before background compaction         | Deep-copy `PipelineState` before passing to compactor            |
| **Transcript fallback**             | Save full conversation to disk, embed path in summary  | Save raw reasoning to temp file, reference in compact context    |

### Patterns We Intentionally Diverge From

| Pattern                 | Copilot Does                 | We Do Instead                       | Why                                                                        |
| ----------------------- | ---------------------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| **Compaction model**    | Same primary model           | Cheap auxiliary model (gpt-4o-mini) | Our context is simpler — code review summaries vs multi-turn conversations |
| **Reactive compaction** | Compact when budget exceeded | Proactive after every skill         | Pipeline design: each skill gets a fresh context window                    |
| **What gets compacted** | Full conversation history    | Only reasoning traces               | Findings pass through unchanged                                            |

### Copilot Chat Source Files (for reference)

If you need implementation examples, these files in `microsoft/vscode-copilot-chat` are relevant:

| File                                                                 | Lines | Key Pattern                                               |
| -------------------------------------------------------------------- | ----- | --------------------------------------------------------- |
| `src/extension/prompts/node/agent/agentIntent.ts`                    | 1021  | Background compaction orchestration, dual-threshold logic |
| `src/extension/prompts/node/agent/toolCallingLoop.ts`                | 1881  | Inline summarization extraction, `applySummaryToRound()`  |
| `src/extension/prompts/node/agent/summarizedConversationHistory.tsx` | 1138  | Summarization prompt, LLM call, size validation           |
| `src/extension/prompts/node/agent/backgroundSummarizer.ts`           | 125   | State machine (Idle → InProgress → Completed/Failed)      |

Browse at: `https://github.com/microsoft/vscode-copilot-chat/tree/main/src/extension/prompts/node/agent/`

---

## Checklist — Do NOT Skip

Before marking any phase complete:

- [ ] Read the relevant files listed in that phase's "Read first" section
- [ ] Use `mcp_codetrellis_get_context_for_file()` for every file you modify
- [ ] Ensure BOTH code paths are updated (SDK: `src/sdk/analyze.ts`, CLI: `src/cli/output/tasks.ts`)
- [ ] Run `pnpm lint && pnpm build && pnpm test` after each phase
- [ ] New types use `export type` for type-only exports
- [ ] New files have co-located tests
- [ ] Config changes have Zod schemas with defaults
- [ ] No `any` types, no non-null assertions

## Error Handling

- If a skill fails during sequential execution, log the error, skip that skill, and continue with the next
- If compaction fails, pass an empty context to the next skill (graceful degradation)
- If the compaction model is unavailable, fall back to no compaction (Phase 1 behavior)
- Never let a pipeline error crash the entire action — each skill should update its own check run independently
