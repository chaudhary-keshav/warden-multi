# Diagram 6 — Module Dependency & Data Flow Graph Reference

**Corresponding diagram:** Diagram 6 in `warden-uml-diagrams.html`
**What this shows:** Every TypeScript module in the `src/` directory, grouped into 9 layers,
with arrows showing which module depends on which, and which modules connect to external services.

---

## How to Read the Diagram

- **Boxes** = individual source files / modules
- **Solid arrows** (`→`) = "this module imports from / calls" the next
- **Dashed arrows** (`-.->`) = cross-cutting types or utilities used everywhere
- **Colored subgraphs** = layers grouped by responsibility
- Read top-to-bottom for flow: entry → config/event → orchestration → core SDK → output → external

---

## Layer 1 — Entry Points (Blue)

These two modules are the _only_ ways Warden starts. Everything else is downstream.

| Module              | File                  | Description                                                                                                                                          |
| ------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **action/index.ts** | `src/action/index.ts` | GitHub Action entry point. Executed by the GitHub Actions runner as `node dist/action/index.js`. Calls `action/main.ts`.                             |
| **cli/main.ts**     | `src/cli/main.ts`     | CLI binary entry point. Executed as `warden` from the terminal. Parses args and orchestrates the scan flow directly (no separate scan command file). |

---

## Layer 2 — Config Layer (Green)

Responsible for reading, validating, and (optionally) writing `warden.toml`.

| Module               | File                   | Description                                                                                                                                                                                                      |
| -------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **config/loader.ts** | `src/config/loader.ts` | Reads `warden.toml`, parses TOML, validates against the Zod schema, and returns a typed `WardenConfig`. Called by both entry points at startup.                                                                  |
| **config/schema.ts** | `src/config/schema.ts` | Contains all Zod schemas: `WardenConfigSchema`, `SkillConfigSchema`, `SkillTriggerSchema`, `DefaultsSchema`, `ChunkingConfigSchema`, etc. Not called at runtime — only referenced by `loader.ts` for validation. |
| **config/writer.ts** | `src/config/writer.ts` | Writes a new or updated `warden.toml`. Used by `warden init` command to create an initial config.                                                                                                                |

**Arrow:** `config/loader.ts → config/schema.ts` (imports schemas for validation)

---

## Layer 3 — Event Layer (Purple)

Responsible for building the `EventContext` — the unified context object that represents _what is being analyzed_.

| Module               | File                   | Description                                                                                                                                                                                    |
| -------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **event/context.ts** | `src/event/context.ts` | Core context builder. In GitHub Action mode: calls GitHub API to fetch PR files. In CLI mode: reads from `git diff`. Produces `EventContext { eventType, pullRequest, repository, repoPath }`. |
| **event/index.ts**   | `src/event/index.ts`   | Re-exports from `event/context.ts`. Barrel file — allows `import { buildEventContext } from "../event"` instead of deep paths.                                                                 |

**Arrow:** `event/context.ts → event/index.ts` (index re-exports context)

---

## Layer 4 — Action Workflow (Red) — GitHub Action only

This entire layer only runs during a GitHub Action execution. Not used in CLI mode.

| Module                             | File                                 | Description                                                                                                                                                                                                    |
| ---------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **action/main.ts**                 | `src/action/main.ts`                 | Router. Reads the event type and routes to `pr-workflow.ts` (for PR events) or `schedule.ts` (for cron events).                                                                                                |
| **action/workflow/pr-workflow.ts** | `src/action/workflow/pr-workflow.ts` | Main 4-phase PR orchestrator. Coordinates all other action modules. The heart of the GitHub Action.                                                                                                            |
| **action/workflow/schedule.ts**    | `src/action/workflow/schedule.ts`    | Cron-mode orchestrator. Similar to PR workflow but designed for scheduled batch runs (e.g. nightly scans).                                                                                                     |
| **action/workflow/dedup.ts**       | `src/output/dedup.ts`                | Deduplicates findings from multiple trigger results. Uses finding IDs to remove duplicates when several skills detect the same issue. **Note:** Lives in `src/output/`, not `src/action/workflow/`.            |
| **action/review/poster.ts**        | `src/action/review/poster.ts`        | Posts a GitHub PR Review with all the rendered comments and the summary body. Calls the GitHub Reviews API.                                                                                                    |
| **action/review/stale.ts**         | `src/output/stale.ts`                | Handles stale comment resolution. When a finding from a previous run no longer appears, this module dismisses or resolves the old comment. **Note:** Lives in `src/output/`, not `src/action/review/`.         |
| **action/triggers/executor.ts**    | `src/action/triggers/executor.ts`    | Executes one matched trigger — loads skill, prepares diff, calls analysis, renders output, creates GitHub Check result.                                                                                        |
| **action/triggers/matcher.ts**     | `src/triggers/matcher.ts`            | Matches the current GitHub event against all triggers configured in `warden.toml`. Returns `ResolvedTrigger[]`. **Note:** Lives in `src/triggers/`, not `src/action/triggers/`. Shared by both Action and CLI. |
| **action/checks/manager.ts**       | `src/action/checks/manager.ts`       | Creates and updates GitHub Check Runs (the yellow ● / green ✓ / red ✗ status boxes on a PR).                                                                                                                   |
| **action/fix-evaluation/index.ts** | `src/action/fix-evaluation/index.ts` | After each run, compares findings with the previous run to determine which bugs were fixed (`FixStatus: fixed / not_fixed / unknown`).                                                                         |
| **action/inputs.ts**               | `src/action/inputs.ts`               | Reads and validates GitHub Action input parameters (`anthropicApiKey`, `githubToken`, `wardenTomlPath`, `model`) from the `inputs:` block in `action.yml`.                                                     |

**Key arrows:**

- `action/main.ts → pr-workflow.ts` and `→ schedule.ts`
- `pr-workflow.ts → output/dedup.ts`, `→ review/poster.ts`, `→ output/stale.ts`, `→ triggers/executor.ts`, `→ triggers/matcher.ts`, `→ checks/manager.ts`, `→ fix-evaluation/index.ts`, `→ inputs.ts`

---

## Layer 5 — CLI Workflow (Yellow) — CLI only

This layer only runs when `warden` is invoked from the terminal.

| Module                        | File                            | Description                                                                                                                                                  |
| ----------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **cli/main.ts**               | `src/cli/main.ts`               | Main scan orchestrator. Loads config, builds local context, loads skills, prepares diffs, runs analysis, and renders output. All scan logic lives here.      |
| **cli/fix.ts**                | `src/cli/fix.ts`                | Handles `--fix` mode. After findings are shown, calls Claude to generate a patch for each selected finding.                                                  |
| **cli/args.ts**               | `src/cli/args.ts`               | Parses command-line arguments (`--fix`, `--skill`, `--json`, `--log`, file paths) into a typed `CLIOptions` object.                                          |
| **cli/context.ts**            | `src/cli/context.ts`            | CLI-mode context builder. Calls `cli/git.ts` to get the diff, then builds an `EventContext` with `eventType = "local"`. Contains `buildLocalEventContext()`. |
| **cli/input.ts**              | `src/cli/input.ts`              | Terminal input utilities — provides `readSingleKey()` for interactive prompts and `UserAbortError` for Ctrl+C handling.                                      |
| **cli/git.ts**                | `src/cli/git.ts`                | Runs git commands — `git diff`, `git rev-parse`, `git log`, etc. Parses git output into structured data.                                                     |
| **cli/terminal.ts**           | `src/cli/terminal.ts`           | Delegates to the React/Ink terminal UI component for rendering findings in color in the terminal.                                                            |
| **cli/diff-apply.ts**         | `src/cli/diff-apply.ts`         | Applies a unified diff patch to a file. Handles hunk offsets, context line matching, and writes back the modified file.                                      |
| **cli/log-cleanup.ts**        | `src/cli/log-cleanup.ts`        | Cleans up old analysis log files from previous runs to prevent disk bloat.                                                                                   |
| **cli/files.ts**              | `src/cli/files.ts`              | File expansion utilities — resolves globs, expands directories into file lists for scanning.                                                                 |
| **cli/commands/init.ts**      | `src/cli/commands/init.ts`      | `warden init` command — creates an initial `warden.toml` config file.                                                                                        |
| **cli/commands/add.ts**       | `src/cli/commands/add.ts`       | `warden add` command — adds a new skill to `warden.toml`.                                                                                                    |
| **cli/commands/sync.ts**      | `src/cli/commands/sync.ts`      | `warden sync` command — syncs remote skills to local.                                                                                                        |
| **cli/commands/logs.ts**      | `src/cli/commands/logs.ts`      | `warden logs` command — views or manages analysis log files.                                                                                                 |
| **cli/commands/setup-app.ts** | `src/cli/commands/setup-app.ts` | `warden setup-app` command — interactive GitHub App installation flow.                                                                                       |
| **cli/output/formatters.ts**  | `src/cli/output/formatters.ts`  | Formatting utilities for terminal output — severity badges, code blocks, etc.                                                                                |
| **cli/output/reporter.ts**    | `src/cli/output/reporter.ts`    | Reporter class that manages output streams and verbosity levels.                                                                                             |
| **cli/output/jsonl.ts**       | `src/cli/output/jsonl.ts`       | JSONL output format for machine-readable pipeline output.                                                                                                    |

**Key arrows:**

- `cli/main.ts → cli/context.ts → cli/git.ts`
- `cli/main.ts → cli/fix.ts`
- `cli/main.ts → cli/commands/init.ts`, `→ add.ts`, `→ sync.ts`, `→ logs.ts`, `→ setup-app.ts`

---

## Layer 6 — SDK Core (Blue) — Shared by Action and CLI

The SDK is the shared analysis engine. Both the GitHub Action (`triggers/executor.ts`) and the CLI (`commands/scan.ts`) call into the SDK.

| Module                 | File                     | Description                                                                                                                                                                                                                                     |
| ---------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **sdk/prepare.ts**     | `src/sdk/prepare.ts`     | The diff preparation pipeline. Input: `EventContext`. Output: `PreparedFile[]`. Stages: parse patches → split large hunks → coalesce nearby hunks → expand context → group by file.                                                             |
| **sdk/analyze.ts**     | `src/sdk/analyze.ts`     | The core analysis engine. Manages the loop over prepared files and hunks, builds prompts (via `prompt.ts`), calls Claude, extracts JSON findings, normalizes severity, filters out-of-range findings, handles retries with exponential backoff. |
| **sdk/prompt.ts**      | `src/sdk/prompt.ts`      | Prompt factory. `buildHunkSystemPrompt(skill)` assembles role + skill instructions + output JSON format. `buildHunkUserPrompt(hunk, prContext)` assembles the PR context + code diff.                                                           |
| **sdk/runner.ts**      | `src/sdk/runner.ts`      | Skill runner orchestrator. Contains `runSkillOnFiles` — the main entry point. Manages concurrency, verification of auth, abort signaling.                                                                                                       |
| **sdk/extract.ts**     | `src/sdk/extract.ts`     | Two-tier finding extraction: first attempts regex JSON extraction from Claude's response, then falls back to Haiku LLM repair if regex fails.                                                                                                   |
| **sdk/haiku.ts**       | `src/sdk/haiku.ts`       | Auxiliary LLM client. Calls Claude Haiku for lightweight tasks: extraction repair, semantic deduplication, and other sub-tasks that don't need the primary model.                                                                               |
| **sdk/retry.ts**       | `src/sdk/retry.ts`       | Retry logic with exponential backoff for SDK calls. Handles transient API errors and rate limits.                                                                                                                                               |
| **sdk/errors.ts**      | `src/sdk/errors.ts`      | Error type definitions for SDK operations — distinguishes retryable vs fatal errors.                                                                                                                                                            |
| **sdk/usage.ts**       | `src/sdk/usage.ts`       | Token usage tracking and aggregation. Merges per-hunk `UsageStats` into aggregate skill-level totals.                                                                                                                                           |
| **sdk/pricing.ts**     | `src/sdk/pricing.ts`     | Cost calculation from token counts. Maps model names to per-token pricing for cost estimation.                                                                                                                                                  |
| **sdk/fix-quality.ts** | `src/sdk/fix-quality.ts` | Evaluates LLM-generated code fixes for quality — checks that patches apply cleanly, don't regress, etc.                                                                                                                                         |
| **sdk/auth.ts**        | `src/sdk/auth.ts`        | Authentication verification for the Claude API key before starting analysis.                                                                                                                                                                    |
| **sdk/types.ts**       | `src/sdk/types.ts`       | SDK-specific runtime types: `DiffHunk`, `HunkWithContext`, `PreparedFile`, `HunkAnalysisResult`, `SkillRunnerOptions`, etc.                                                                                                                     |

**Key arrows:**

- `sdk/analyze.ts → sdk/prompt.ts` (builds prompts)
- `sdk/analyze.ts → sdk/extract.ts` (extracts findings from Claude response)
- `sdk/analyze.ts → sdk/haiku.ts` (auxiliary LLM calls for extraction repair)
- `sdk/runner.ts → sdk/analyze.ts` (orchestrates analysis)
- `sdk/runner.ts → sdk/prepare.ts` (orchestrates preparation)
- `sdk/analyze.ts → Anthropic Claude API` (makes AI calls)

---

## Layer 7 — Diff Layer (Teal) — Part of SDK preparation

Lower-level diff parsing and manipulation utilities used by `sdk/prepare.ts`.

| Module               | File                   | Description                                                                                                                               |
| -------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **diff/parser.ts**   | `src/diff/parser.ts`   | Parses a raw unified diff string into structured `DiffHunk[]` objects. Handles `@@ -start,len +start,len @@` headers and +/−/space lines. |
| **diff/context.ts**  | `src/diff/context.ts`  | Expands hunks with surrounding unchanged lines — reads the actual source file and prepends/appends context lines.                         |
| **diff/classify.ts** | `src/diff/classify.ts` | Classifies hunks by type (pure addition, pure deletion, modification) to help prioritize analysis.                                        |
| **diff/coalesce.ts** | `src/diff/coalesce.ts` | Merges nearby hunks in the same file. If two hunks are within `maxGapLines` (default 30) of each other, they become one larger hunk.      |
| **diff/apply.ts**    | `src/diff/apply.ts`    | Applies a unified diff patch back to a file (used in `--fix` mode). Handles offset adjustments when patches don't apply cleanly.          |

**Key arrows:**

- `diff/parser.ts → diff/context.ts`
- `diff/context.ts → diff/coalesce.ts`

---

## Layer 8 — Output Layer (Purple)

Responsible for turning a `SkillReport` into human-readable text — either markdown for GitHub or colors for the terminal.

| Module                       | File                           | Description                                                                                                                                       |
| ---------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **output/renderer.ts**       | `src/output/renderer.ts`       | Markdown renderer. Converts `SkillReport` → `RenderResult`. Produces GitHub PR review body text and inline comment strings formatted as markdown. |
| **output/dedup.ts**          | `src/output/dedup.ts`          | Deduplication engine. Removes duplicate findings across trigger results — used by the Action's PR workflow.                                       |
| **output/stale.ts**          | `src/output/stale.ts`          | Stale comment resolution. Compares current findings with previous run and marks resolved comments as outdated.                                    |
| **output/types.ts**          | `src/output/types.ts`          | Output type definitions — `RenderResult`, `RenderOptions`, `GitHubReview`, `GitHubComment`.                                                       |
| **output/github-checks.ts**  | `src/output/github-checks.ts`  | GitHub Checks API integration — creates and updates Check Runs on PRs.                                                                            |
| **output/github-issues.ts**  | `src/output/github-issues.ts`  | GitHub Issues integration — used by scheduled scans to create issues for findings.                                                                |
| **output/issue-renderer.ts** | `src/output/issue-renderer.ts` | Renders findings as GitHub Issue bodies for the schedule trigger workflow.                                                                        |
| **cli/output/formatters.ts** | `src/cli/output/formatters.ts` | Terminal formatting utilities — severity badge strings, code block formatting, location line references. Used by terminal output.                 |
| **cli/output/reporter.ts**   | `src/cli/output/reporter.ts`   | Reporter class managing terminal output streams and verbosity.                                                                                    |

**Key arrows:**

- `output/renderer.ts → output/types.ts`

---

## Layer 9 — Types & Utils (Gray) — Cross-Cutting

These modules are used everywhere — shown as dashed `-.->` arrows in the diagram because they cross all layers.

| Module               | File                   | Description                                                                                                                                                                               |
| -------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **types/index.ts**   | `src/types/index.ts`   | Single source of truth for all domain types: `Finding`, `SkillReport`, `EventContext`, `PullRequestContext`, `FileChange`, `UsageStats`, etc. Every other module imports types from here. |
| **skills/loader.ts** | `src/skills/loader.ts` | Skill loading engine — loads SKILL.md files from local filesystem or remote repositories. Returns `SkillDefinition` objects.                                                              |
| **skills/remote.ts** | `src/skills/remote.ts` | Remote skill fetching — downloads SKILL.md from remote Git repos when skills are referenced as `owner/repo/path`.                                                                         |
| **utils/async.ts**   | `src/utils/async.ts`   | Async concurrency utilities: `Semaphore` class (concurrent slot gate) and pool runner. Used by `sdk/runner.ts` and `triggers/executor.ts`.                                                |
| **sentry.ts**        | `src/sentry.ts`        | Sentry error monitoring and performance tracing setup. Initializes the Sentry SDK. `sdk/analyze.ts` uses Sentry spans to trace each `executeQuery()` call for performance monitoring.     |

**Dashed arrows:**

- `types/index.ts -.-> SDK` (all SDK modules use domain types)
- `types/index.ts -.-> Action Workflow` (all action modules use domain types)
- `types/index.ts -.-> CLI Workflow` (all CLI modules use domain types)
- `types/index.ts -.-> Output Layer`
- `utils/async.ts -.-> triggers/executor.ts` (Semaphore injection)
- `sentry.ts -.-> sdk/analyze.ts` (performance tracing)

---

## External Services

| Service                     | Module(s) That Call It                   | What It Does                                                  |
| --------------------------- | ---------------------------------------- | ------------------------------------------------------------- |
| **GitHub API (Octokit)**    | `pr-workflow.ts`, `triggers/executor.ts` | Fetch PR file lists, create reviews, list comments            |
| **Anthropic Claude API**    | `sdk/analyze.ts`                         | The AI calls — send prompts, receive findings JSON            |
| **GitHub Checks & Reviews** | `checks/manager.ts`, `review/poster.ts`  | Create/update Check Runs; post PR Review with inline comments |

---

## Dependency Flow Summary

```
Entry Points (2 modules)
  ↓
Config Layer (3 modules) + Event Layer (2 modules)        [both entry points call these]
  ↓
Orchestration (Action: 10 modules | CLI: 8 modules)       [choice of path based on entry]
  ↓
SDK Core (13 modules)                                      [shared between Action and CLI]
  ↓
Diff Layer (5 modules)                                     [lower-level, called by SDK]
  ↓
Output Layer (9 modules)                                   [renders for GitHub or terminal]
  ↓
External Services (3 services)                             [Claude API, GitHub API]

Types & Utils (5 modules)                                  [used by ALL layers above]
```

---

## Which Modules Are Shared vs Exclusive?

| Module                                                                                                                                                                                                         | Used By                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `sdk/prepare.ts`, `sdk/analyze.ts`, `sdk/prompt.ts`, `sdk/runner.ts`, `sdk/extract.ts`, `sdk/haiku.ts`, `sdk/retry.ts`, `sdk/errors.ts`, `sdk/usage.ts`, `sdk/pricing.ts`, `sdk/fix-quality.ts`, `sdk/auth.ts` | **Both** Action and CLI              |
| `diff/*` (5 modules)                                                                                                                                                                                           | **Both** via `sdk/prepare.ts`        |
| `output/renderer.ts`, `output/dedup.ts`, `output/stale.ts`, `output/types.ts`                                                                                                                                  | **Both** (dedup/stale mainly Action) |
| `output/github-checks.ts`, `output/github-issues.ts`, `output/issue-renderer.ts`                                                                                                                               | **Action only**                      |
| `config/loader.ts`, `config/schema.ts`                                                                                                                                                                         | **Both**                             |
| `event/context.ts`                                                                                                                                                                                             | **Both**                             |
| `types/index.ts`, `utils/async.ts`                                                                                                                                                                             | **Both**                             |
| `action/workflow/pr-workflow.ts` and all `action/*`                                                                                                                                                            | **Action only**                      |
| `cli/main.ts` (scan), `cli/fix.ts`, `cli/terminal.ts`, etc.                                                                                                                                                    | **CLI only**                         |
| `skills/loader.ts`, `skills/remote.ts`                                                                                                                                                                         | **Both**                             |
