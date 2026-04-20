# Sequential Pipeline Architecture — Multi-Step Code Review

> Warden skill execution redesign: from parallel single-step to sequential multi-step with context compaction.

## Problem Statement

### Current Architecture (Parallel)

```
┌────────────────────────────────────────────────────────────┐
│  Single GitHub Actions Step                                │
│  Single OpenAI API Key / Org / TPM Budget                  │
│                                                            │
│  executeAllTriggers() → runPool(ALL_AT_ONCE)               │
│                                                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐     │
│  │ Skill A  │ │ Skill B  │ │ Skill C  │ │ Skill D  │     │
│  │ 100 hunks│ │ 100 hunks│ │ 50 hunks │ │ 200 hunks│     │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘     │
│       │            │            │            │             │
│       └────────────┴────────────┴────────────┘             │
│                        │                                   │
│              OpenAI API (gpt-5.2)                          │
│              500K TPM shared across all                    │
│              → 429 RATE LIMIT after ~45 seconds            │
└────────────────────────────────────────────────────────────┘
```

**Failures observed (PR #1):**

- `find-warden-bugs` + `architecture-review` consumed ~500K tokens in first minute
- `code-simplifier`, `testing-guidelines`, `codetrellis-aware-review` → 429 errors
- No context sharing — each skill re-analyzes the same files from scratch
- Redundant findings across skills (42 total, many overlapping)

### Proposed Architecture (Sequential + Compaction)

```
┌─────────────────────────────────────────────────────────────────────┐
│  GitHub Actions Pipeline — Multi-Step Sequential                    │
│                                                                     │
│  Step 1: find-warden-bugs                                          │
│  ┌───────────────────────────────────────────────────────────┐      │
│  │  Input: PR diff + skill prompt                            │      │
│  │  Model: gpt-5.2                                           │      │
│  │  Output: findings[] + reasoning traces                    │      │
│  └───────────────────────┬───────────────────────────────────┘      │
│                          │                                          │
│  Compact (gpt-4o-mini)   │  ← cheap model, ~100 tokens output      │
│  ┌───────────────────────▼───────────────────────────────────┐      │
│  │  Input: raw reasoning traces from Step 1                  │      │
│  │  Output: compressed context (files analyzed, patterns     │      │
│  │          observed, areas NOT covered, key observations)   │      │
│  │  Findings: passed through as-is (no compaction)           │      │
│  └───────────────────────┬───────────────────────────────────┘      │
│                          │                                          │
│  Step 2: architecture-review                                       │
│  ┌───────────────────────▼───────────────────────────────────┐      │
│  │  Input: PR diff + skill prompt                            │      │
│  │       + compacted context from Step 1                     │      │
│  │       + Step 1 findings (for dedup awareness)             │      │
│  │  Model: gpt-5.2                                           │      │
│  │  Output: findings[] + reasoning traces                    │      │
│  └───────────────────────┬───────────────────────────────────┘      │
│                          │                                          │
│  Compact (gpt-4o-mini)   │                                          │
│  ┌───────────────────────▼───────────────────────────────────┐      │
│  │  Merges: Step 1 context + Step 2 reasoning                │      │
│  │  Output: accumulated compressed context                   │      │
│  └───────────────────────┬───────────────────────────────────┘      │
│                          │                                          │
│  Step 3: testing-guidelines                                        │
│  ┌───────────────────────▼───────────────────────────────────┐      │
│  │  Input: PR diff + skill prompt + accumulated context      │      │
│  │       + all prior findings                                │      │
│  │  Model: gpt-5.2                                           │      │
│  └───────────────────────┬───────────────────────────────────┘      │
│                          │                                          │
│  ... continues for each skill ...                                  │
│                          │                                          │
│  Step N: codetrellis-aware-review (MCP-enabled)                    │
│  ┌───────────────────────▼───────────────────────────────────┐      │
│  │  Input: PR diff + skill prompt + accumulated context      │      │
│  │       + all prior findings + MCP tools                    │      │
│  │  Model: gpt-5.2                                           │      │
│  │  Has FULL picture of what all prior skills found          │      │
│  └───────────────────────────────────────────────────────────┘      │
│                                                                     │
│  Final: Post all reviews + update checks                           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Detailed Design

### Core Concepts

#### 1. Pipeline Phases

Each skill goes through three phases:

| Phase       | Model               | Purpose                                         | Token Cost  |
| ----------- | ------------------- | ----------------------------------------------- | ----------- |
| **Analyze** | gpt-5.2 (primary)   | Run skill against PR hunks                      | ~3,500/hunk |
| **Compact** | gpt-4o-mini (cheap) | Compress reasoning into context                 | ~500 total  |
| **Handoff** | — (data only)       | Pass findings + compacted context to next skill | 0           |

#### 2. What Gets Compacted vs Passed Through

| Data                  | Treatment               | Why                                                |
| --------------------- | ----------------------- | -------------------------------------------------- |
| **Findings**          | Pass-through (as-is)    | Exact data, no information loss                    |
| **Reasoning traces**  | Compact via cheap model | Reduce tokens, keep key insights                   |
| **File coverage map** | Compact (structured)    | "Which files were analyzed, which weren't"         |
| **Observations**      | Compact (narrative)     | "Patterns noticed: error handling is inconsistent" |
| **Usage stats**       | Pass-through            | Needed for cost tracking                           |

#### 3. Compaction Prompt Template

```
You are a code review context compressor. Given the reasoning traces from
a "{skill_name}" code review skill, produce a compressed context summary.

INCLUDE:
- Files analyzed and key observations per file (1-2 lines each)
- Patterns/anti-patterns observed across the codebase
- Areas the skill did NOT cover or flagged as needing deeper review
- Architectural concerns noticed but not reported as findings

DO NOT INCLUDE:
- The actual findings (those are passed separately)
- Code snippets (the next skill has the diff)
- Severity assessments (those are in findings)

Keep under 500 tokens. Use bullet points.
```

### Architecture Components

#### A. PipelineState — Accumulated Context

```typescript
interface PipelineState {
  /** Skill execution order (completed so far) */
  completedSkills: string[];

  /** All findings from all completed skills — passed through unchanged */
  allFindings: Finding[];

  /** Compacted reasoning context — grows with each skill, compressed each time */
  compactedContext: string;

  /** Per-skill usage tracking */
  usageBySkill: Record<string, UsageStats>;

  /** Per-skill compaction usage (cheap model costs) */
  compactionUsage: UsageStats;

  /** Files already deeply analyzed (for coverage awareness) */
  analyzedFiles: Set<string>;
}
```

#### B. SkillStepResult — Output of One Step

```typescript
interface SkillStepResult {
  /** Skill name */
  skill: string;

  /** Findings from this skill */
  findings: Finding[];

  /** Raw reasoning traces (before compaction) */
  reasoningTraces: string[];

  /** Per-file analysis notes */
  fileNotes: Record<string, string>;

  /** Usage stats for this skill's primary model calls */
  usage: UsageStats;

  /** The full SkillReport for check run updates */
  report: SkillReport;
}
```

#### C. Pipeline Execution Engine

```typescript
async function executeSequentialPipeline(
  orderedTriggers: ResolvedTrigger[],
  context: EventContext,
  config: WardenConfig,
  inputs: ActionInputs,
  octokit: Octokit,
): Promise<TriggerResult[]> {
  const state: PipelineState = {
    completedSkills: [],
    allFindings: [],
    compactedContext: "",
    usageBySkill: {},
    compactionUsage: emptyUsage(),
    analyzedFiles: new Set(),
  };

  const results: TriggerResult[] = [];

  for (const trigger of orderedTriggers) {
    // 1. ANALYZE — Run skill with accumulated context
    const stepResult = await executeSkillStep(
      trigger,
      context,
      config,
      inputs,
      state,
    );

    // 2. UPDATE — Create/update GitHub check run immediately
    await updateSkillCheckRun(octokit, context, trigger, stepResult);

    // 3. COMPACT — Compress reasoning via cheap model
    const compacted = await compactReasoning(
      stepResult,
      state.compactedContext,
      config,
    );

    // 4. ACCUMULATE — Update pipeline state
    state.completedSkills.push(trigger.skill);
    state.allFindings.push(...stepResult.findings);
    state.compactedContext = compacted.context;
    state.compactionUsage = mergeUsage(state.compactionUsage, compacted.usage);
    state.usageBySkill[trigger.skill] = stepResult.usage;
    for (const file of Object.keys(stepResult.fileNotes)) {
      state.analyzedFiles.add(file);
    }

    // 5. COLLECT — Build TriggerResult for downstream posting
    results.push(buildTriggerResult(trigger, stepResult));
  }

  return results;
}
```

#### D. Augmented System Prompt (for skills after the first)

```typescript
function buildAugmentedSystemPrompt(
  skillPrompt: string, // Original SKILL.md content
  state: PipelineState, // Accumulated pipeline state
): string {
  if (state.completedSkills.length === 0) {
    return skillPrompt; // First skill — no prior context
  }

  return `${skillPrompt}

## Prior Review Context

The following skills have already reviewed this PR: ${state.completedSkills.join(", ")}

### Observations from prior reviews:
${state.compactedContext}

### Existing findings (${state.allFindings.length} total):
${formatFindingSummaries(state.allFindings)}

IMPORTANT:
- Do NOT duplicate findings that overlap with the above.
- Focus on issues specific to YOUR skill's domain.
- You may reference prior observations to support deeper analysis.
- If a prior skill flagged an area as "needs deeper review", prioritize it.
`;
}
```

#### E. Compaction Function

```typescript
async function compactReasoning(
  stepResult: SkillStepResult,
  priorContext: string,
  config: WardenConfig,
): Promise<{ context: string; usage: UsageStats }> {
  const provider = createProvider("openai"); // or whatever is configured

  const result = await provider.query({
    systemPrompt: COMPACTION_SYSTEM_PROMPT,
    userPrompt: buildCompactionUserPrompt(stepResult, priorContext),
    model: "gpt-4o-mini", // Cheapest model — compaction only
    apiKey: config.defaults?.provider?.apiKey,
    maxTurns: 1, // Single turn, no tool use
  });

  return {
    context: result.content,
    usage: result.usage,
  };
}

function buildCompactionUserPrompt(
  stepResult: SkillStepResult,
  priorContext: string,
): string {
  let prompt = "";

  if (priorContext) {
    prompt += `## Existing accumulated context:\n${priorContext}\n\n`;
  }

  prompt += `## New reasoning from "${stepResult.skill}":\n`;
  prompt += stepResult.reasoningTraces.join("\n---\n");
  prompt += `\n\n## Files analyzed:\n`;
  prompt += Object.entries(stepResult.fileNotes)
    .map(([file, note]) => `- ${file}: ${note}`)
    .join("\n");

  prompt += `\n\nCompress the above into an accumulated context summary. Max 500 tokens.`;

  return prompt;
}
```

### Skill Execution Order

Skills ordered by **specificity** (narrow → broad) so later skills benefit most from accumulated context:

```
Step 1: find-warden-bugs        ← Domain-specific, catches known bug patterns
Step 2: architecture-review     ← Structural analysis, informed by bug findings
Step 3: testing-guidelines      ← Test coverage, knows which code has bugs/arch issues
Step 4: code-simplifier         ← Simplification, avoids conflicting with prior findings
Step 5: codetrellis-aware-review ← MCP-powered, has FULL picture from all prior skills
```

**Why this order?**

- `find-warden-bugs` is fastest and most targeted — produces high-signal findings early
- `architecture-review` benefits from knowing which bugs exist (structural root causes)
- `testing-guidelines` knows which code has bugs/issues and can prioritize test coverage
- `code-simplifier` avoids suggesting simplifications that conflict with bug fixes
- `codetrellis-aware-review` runs last with MCP tools + full accumulated context = best quality

### Reasoning Trace Capture

Currently, Warden doesn't capture reasoning traces — only findings. We need to extract them.

#### Option A: Parse from model response (no schema change)

The model's response includes both findings JSON and surrounding text. Currently, only the JSON is extracted. The surrounding text IS the reasoning trace.

```typescript
// In analyzeHunk() — after extractFindings()
const reasoningTrace = extractReasoningFromResponse(resultMessage.content);
// Everything that isn't the JSON findings block
```

#### Option B: Add explicit reasoning field to prompt schema

```
Return your analysis as JSON:
{
  "findings": [...],
  "reasoning": "Brief summary of your analysis approach and observations"
}
```

**Recommendation: Option B** — explicit is better, and the cheap compaction model needs structured input.

---

## Token Budget Analysis

### Current (Parallel) — Failed

```
5 skills × ~100 hunks × 3,500 tokens/hunk = ~1,750,000 tokens
All in first minute → 500K TPM limit → 429 errors for 3/5 skills
```

### Proposed (Sequential + Compaction)

```
Skill 1: find-warden-bugs
  Analyze: ~100 hunks × 3,500 = 350,000 tokens
  Compact: 1 call × 500 = 500 tokens
  Subtotal: 350,500

  [Wait ~1 minute for TPM reset]

Skill 2: architecture-review
  Analyze: ~100 hunks × 3,800 = 380,000 tokens  (slightly larger: +300 context tokens/hunk)
  Compact: 1 call × 500 = 500 tokens
  Subtotal: 380,500

  [Wait ~1 minute for TPM reset]

Skill 3: testing-guidelines
  Analyze: ~50 hunks × 3,800 = 190,000 tokens
  Compact: 1 call × 500 = 500 tokens
  Subtotal: 190,500 (fits in same minute)

Skill 4: code-simplifier
  Analyze: ~200 hunks × 3,800 = 760,000 tokens → needs 2 minutes
  Compact: 1 call × 500 = 500 tokens
  Subtotal: 760,500

Skill 5: codetrellis-aware-review
  Analyze: ~100 hunks × 4,000 = 400,000 tokens  (+MCP tool calls)
  Compact: N/A (last skill)
  Subtotal: 400,000

TOTAL: ~2,081,500 tokens across ~6-8 minutes
Compaction overhead: ~2,000 tokens (negligible)
```

**Key improvement:** Sequential execution naturally spreads token consumption across minutes, staying within TPM limits. Each skill's ~350K tokens fits within the 500K/min budget.

### Cost Comparison

| Approach             | Primary Model Tokens        | Compaction Tokens | Total Cost (est.)   |
| -------------------- | --------------------------- | ----------------- | ------------------- |
| Current (parallel)   | ~1,750K (but 3 skills fail) | 0                 | ~$5.25 (incomplete) |
| Sequential + compact | ~2,080K (all succeed)       | ~2K               | ~$6.25 + $0.001     |

Compaction adds **<0.02% cost** while enabling context sharing.

---

## Implementation Plan

### Phase 1: Sequential Execution (No Compaction)

Simplest change — just run skills one-at-a-time instead of all-at-once.

**Files to modify:**

- `src/action/workflow/pr-workflow.ts` — Change `executeAllTriggers` to use `concurrency: 1` in `runPool`
- `warden.toml` — Add `executionMode = "sequential"` config option

**Estimated effort:** Small — change pool concurrency from `matchedTriggers.length` to `1`.

### Phase 2: Reasoning Trace Capture

Modify the prompt schema to capture reasoning alongside findings.

**Files to modify:**

- `src/sdk/prompt.ts` — Add `reasoning` field to output schema
- `src/sdk/analyze.ts` — Extract and store reasoning from responses
- `src/types/index.ts` — Add `reasoning?: string` to `HunkAnalysisResult`

### Phase 3: Compaction Engine

Build the cheap-model compaction step between skills.

**New files:**

- `src/pipeline/compactor.ts` — Compaction logic
- `src/pipeline/state.ts` — PipelineState management
- `src/pipeline/sequential.ts` — Sequential pipeline orchestrator

**Files to modify:**

- `src/action/workflow/pr-workflow.ts` — Wire in sequential pipeline
- `src/config/schema.ts` — Add pipeline config options

### Phase 4: Augmented Prompts

Inject accumulated context into each skill's system prompt.

**Files to modify:**

- `src/sdk/prompt.ts` — `buildAugmentedSystemPrompt()`
- `src/sdk/analyze.ts` — Thread `PipelineState` through analysis

### Phase 5: Smart Ordering & Configuration

**New config in `warden.toml`:**

```toml
[pipeline]
mode = "sequential"           # "sequential" | "parallel" (default: parallel)
compactionModel = "gpt-4o-mini"
skillOrder = [
  "find-warden-bugs",
  "architecture-review",
  "testing-guidelines",
  "code-simplifier",
  "codetrellis-aware-review",
]

[pipeline.compaction]
enabled = true
maxTokens = 500              # Max compacted context size
includeFindings = true       # Pass prior findings to next skill
```

---

## GitHub Actions Workflow — Two Options

### Option A: Single Job, Sequential Steps (Recommended)

```yaml
jobs:
  warden-review:
    name: Warden Code Review
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: chaudhary-keshav/warden-multi@master
        with:
          provider: openai
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          pipeline-mode: sequential # ← new input
```

**Pros:** Simple, single job, no artifacts passing, pipeline logic lives in code.
**Cons:** If one skill fails, later skills still blocked.

### Option B: Multi-Job Matrix with Artifact Passing

```yaml
jobs:
  skill-1-bugs:
    name: "Step 1: find-warden-bugs"
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: chaudhary-keshav/warden-multi@master
        with:
          skills: find-warden-bugs
          pipeline-mode: sequential
          pipeline-step: 1
      - uses: actions/upload-artifact@v4
        with:
          name: pipeline-state-1
          path: .warden/pipeline-state.json

  skill-2-arch:
    name: "Step 2: architecture-review"
    needs: skill-1-bugs
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with:
          name: pipeline-state-1
      - uses: chaudhary-keshav/warden-multi@master
        with:
          skills: architecture-review
          pipeline-mode: sequential
          pipeline-step: 2
          pipeline-state: .warden/pipeline-state.json
      - uses: actions/upload-artifact@v4
        with:
          name: pipeline-state-2
          path: .warden/pipeline-state.json

  # ... repeat for each skill ...

  aggregate:
    name: "Final: Aggregate & Post Reviews"
    needs:
      [skill-1-bugs, skill-2-arch, skill-3-tests, skill-4-simplify, skill-5-mcp]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
      - uses: chaudhary-keshav/warden-multi@master
        with:
          pipeline-mode: aggregate
```

**Pros:** Each skill is a separate job (visible in GitHub UI), independent failure, own runner/logs.
**Cons:** Complex, artifact passing overhead, slower due to job startup time.

### Recommendation: Option A (Single Job)

The sequential pipeline should live **inside the Warden action code**, not in the workflow YAML. This keeps the user's workflow simple and the pipeline logic testable and configurable via `warden.toml`.

---

## Data Flow Diagram

```
                    PR Diff (131K lines)
                          │
                          ▼
                ┌─────────────────┐
                │  Path Filtering  │
                │  (per skill)     │
                └────────┬────────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
     src/**/*.ts    src/**/*.test.ts   all files
     (16 files)     (5 files)         (27 files)
          │              │              │
          ▼              ▼              ▼
  ┌───────────────────────────────────────────────────┐
  │  STEP 1: find-warden-bugs                         │
  │  Input: 16 src files, ~100 hunks                  │
  │  System: SKILL.md prompt                          │
  │  Context: (none — first skill)                    │
  │  Output: 12 findings + reasoning traces           │
  │  Tokens: ~350K                                    │
  └────────────────────┬──────────────────────────────┘
                       │
                       ▼
  ┌───────────────────────────────────────────────────┐
  │  COMPACT (gpt-4o-mini)                            │
  │  Input: reasoning traces from Step 1              │
  │  Output: ~500 token summary                       │
  │  "Analyzed 16 src files. Key observations:        │
  │   - Error handling inconsistent in providers/     │
  │   - MCP client lacks structured error types       │
  │   - Config casts bypass validation in cli/main    │
  │   - analyze.ts has non-null assumptions           │
  │   Not covered: test files, schema validation"     │
  │  Cost: ~$0.0002                                   │
  └────────────────────┬──────────────────────────────┘
                       │
                       ▼
  ┌───────────────────────────────────────────────────┐
  │  STEP 2: architecture-review                      │
  │  Input: 16 src files, ~100 hunks                  │
  │  System: SKILL.md + compacted context + findings  │
  │  Context: "Prior skill found 12 issues including  │
  │   error handling in providers/ — focus on          │
  │   structural/architectural patterns instead"       │
  │  Output: 30 findings + reasoning traces           │
  │  Tokens: ~380K                                    │
  └────────────────────┬──────────────────────────────┘
                       │
                       ▼
  ┌───────────────────────────────────────────────────┐
  │  COMPACT (gpt-4o-mini)                            │
  │  Input: prior context + Step 2 reasoning          │
  │  Output: ~500 token accumulated summary           │
  │  Cost: ~$0.0002                                   │
  └────────────────────┬──────────────────────────────┘
                       │
                       ▼
  ┌───────────────────────────────────────────────────┐
  │  STEP 3: testing-guidelines                       │
  │  Input: 5 test files, ~50 hunks                   │
  │  System: SKILL.md + accumulated context           │
  │  Context: Knows which src files have bugs/arch    │
  │   issues → can suggest targeted test coverage     │
  │  Output: findings + reasoning traces              │
  │  Tokens: ~190K                                    │
  └────────────────────┬──────────────────────────────┘
                       │
                       ▼
  ┌───────────────────────────────────────────────────┐
  │  COMPACT (gpt-4o-mini)                            │
  │  Cost: ~$0.0002                                   │
  └────────────────────┬──────────────────────────────┘
                       │
                       ▼
  ┌───────────────────────────────────────────────────┐
  │  STEP 4: code-simplifier                          │
  │  Input: 27 files (all non-dist), ~200 hunks       │
  │  System: SKILL.md + accumulated context           │
  │  Context: Knows what bugs/arch/test issues exist  │
  │   → avoids simplifying code that's there for a    │
  │     safety reason                                 │
  │  Output: findings + reasoning traces              │
  │  Tokens: ~760K (2 minutes of TPM)                 │
  └────────────────────┬──────────────────────────────┘
                       │
                       ▼
  ┌───────────────────────────────────────────────────┐
  │  COMPACT (gpt-4o-mini)                            │
  │  Cost: ~$0.0002                                   │
  └────────────────────┬──────────────────────────────┘
                       │
                       ▼
  ┌───────────────────────────────────────────────────┐
  │  STEP 5: codetrellis-aware-review (MCP)           │
  │  Input: 16 src files + MCP tools                  │
  │  System: SKILL.md + full accumulated context      │
  │  Context: Complete picture from 4 prior skills    │
  │  MCP: codetrellis search_matrix, get_best_practices│
  │  Output: findings (holistic, gap-filling)         │
  │  Tokens: ~400K                                    │
  └────────────────────┬──────────────────────────────┘
                       │
                       ▼
  ┌───────────────────────────────────────────────────┐
  │  POST REVIEWS                                     │
  │  All findings aggregated, deduplicated, posted    │
  │  Check runs updated per skill                     │
  │  Core check updated with totals                   │
  └───────────────────────────────────────────────────┘
```

---

## Key Benefits

| Benefit                 | Current (Parallel)              | Proposed (Sequential)                  |
| ----------------------- | ------------------------------- | -------------------------------------- |
| **Rate limiting**       | 3/5 skills fail (429)           | All 5 succeed (spread over 6-8 min)    |
| **Duplicate findings**  | High overlap (~40%)             | Low (each skill sees prior findings)   |
| **Review quality**      | Each skill blind to others      | Later skills build on earlier insights |
| **Token efficiency**    | ~1.75M tokens (wasted on dupes) | ~2.08M tokens (but 0% wasted)          |
| **MCP effectiveness**   | Never reached (429'd first)     | Runs last with full context            |
| **Total cost**          | ~$5.25 (incomplete)             | ~$6.25 (complete, better quality)      |
| **Compaction overhead** | N/A                             | ~2K tokens ($0.001)                    |

## Trade-offs

| Trade-off             | Impact                                | Mitigation                                                       |
| --------------------- | ------------------------------------- | ---------------------------------------------------------------- |
| **Slower**            | 6-8 min vs 2 min (if no 429)          | Skills run in optimal order; check runs update in real-time      |
| **Serial failure**    | One skill error blocks later ones     | Each skill has independent error handling; failures skip to next |
| **Context injection** | Adds ~300 tokens/hunk to later skills | Compacted context is small (~500 tokens total, not per-hunk)     |
| **Ordering matters**  | Skill order affects quality           | Configurable via `pipeline.skillOrder` in warden.toml            |

---

## Open Questions

1. **Should compacted context be injected per-hunk or per-file?**
   - Per-file: lower cost, but hunk-level analysis loses cross-file context
   - Per-hunk: higher cost, but each hunk analysis is context-aware
   - **Recommendation:** Per-file (prepend to first hunk's system prompt per file)

2. **Should we add a "gap analysis" step after all skills?**
   - A final cheap-model pass that reviews the accumulated context and identifies
     areas no skill covered → could generate "suggestions for future review"

3. **Should findings dedup happen between skills or only at posting time?**
   - Between skills: prevents wasted analysis tokens on already-found issues
   - At posting: simpler, findings are just passed to the next skill as context
   - **Recommendation:** Pass findings as context (let the model avoid dupes naturally)

4. **How to handle the `code-simplifier` skill exceeding 500K TPM on its own?**
   - It processes 200+ hunks (~760K tokens) — needs 2 minutes of TPM
   - Options: (a) batch hunks within the skill, (b) reduce hunk count via smarter chunking
   - **Recommendation:** Add intra-skill rate limit awareness with backoff/retry

5. **MCP in sequential mode — should the codetrellis server stay alive across hunks?**
   - Currently spawned per-query (per-hunk), ~250 spawns per skill
   - Should be spawned once per skill step, reused across hunks
   - **This is a separate optimization, independent of sequential pipeline**
