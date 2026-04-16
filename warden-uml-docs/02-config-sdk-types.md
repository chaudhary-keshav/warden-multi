# Diagram 2 — Config & SDK Runtime Types Reference

**Corresponding diagram:** Diagram 2 in `warden-uml-diagrams.html`
**Source files:** `src/config/schema.ts`, `src/sdk/prepare.ts`, `src/sdk/analyze.ts`, `src/action/triggers/executor.ts`, `src/utils/async.ts`

This class diagram covers the types that control _how_ Warden runs — configuration, diff pipeline types,
execution wiring, and concurrency utilities.

---

## Configuration Types (from `src/config/schema.ts`)

### `TriggerType`

**What it is:** Defines _when_ a skill should run.

| Value          | Meaning                                                            |
| -------------- | ------------------------------------------------------------------ |
| `pull_request` | Run automatically when a PR is opened or updated on GitHub         |
| `local`        | Run manually from the `warden` CLI on a developer's machine        |
| `schedule`     | Run on a cron schedule (set via `schedule` field in `warden.toml`) |

---

### `SkillTrigger`

**What it is:** One entry in a skill's `triggers` array. Binds a skill to a specific event type and override settings.

| Field             | Type                  | Description                                                                                                |
| ----------------- | --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `type`            | `TriggerType`         | Which event fires this trigger (`pull_request`, `local`, `schedule`)                                       |
| `actions`         | `string[]`            | (Required for `pull_request`) Narrow down by action — e.g. only `["opened", "synchronize"]` not `"closed"` |
| `failOn`          | `SeverityThreshold`   | (Optional) Override the global `failOn` threshold for this specific trigger                                |
| `reportOn`        | `SeverityThreshold`   | (Optional) Override the global `reportOn` threshold for this trigger                                       |
| `maxFindings`     | `number`              | (Optional) Cap findings count for this trigger                                                             |
| `reportOnSuccess` | `boolean`             | (Optional) Post a review even when zero findings                                                           |
| `requestChanges`  | `boolean`             | (Optional) Use `REQUEST_CHANGES` review event when findings exceed `failOn`                                |
| `failCheck`       | `boolean`             | (Optional) Fail the GitHub Check Run when findings exceed `failOn`                                         |
| `model`           | `string`              | (Optional) Override the Claude model for this trigger                                                      |
| `maxTurns`        | `number`              | (Optional) Override max agentic turns per hunk for this trigger                                            |
| `minConfidence`   | `ConfidenceThreshold` | (Optional) Minimum confidence to report findings                                                           |
| `schedule`        | `ScheduleConfig`      | (Optional) Schedule-specific config (issue title, fix PR creation). Only used when `type = "schedule"`.    |

> **Relationship:** `SkillConfig → SkillTrigger[]`

---

### `CoalesceConfig`

**What it is:** Controls how nearby diff hunks are merged together before sending to Claude.
Merging nearby hunks gives Claude more context and reduces API call count.

| Field          | Type      | Description                                                                                    |
| -------------- | --------- | ---------------------------------------------------------------------------------------------- |
| `enabled`      | `boolean` | Whether to coalesce at all (default: `true`)                                                   |
| `maxGapLines`  | `number`  | If two hunks are within this many lines of each other, merge them into one (default: 30)       |
| `maxChunkSize` | `number`  | Maximum total size of a merged chunk in characters (default: 8000). Prevents context overflow. |

---

### `ChunkingConfig`

**What it is:** Controls the diff preparation pipeline — which files to chunk and how.

| Field             | Type             | Description                                                                                                  |
| ----------------- | ---------------- | ------------------------------------------------------------------------------------------------------------ |
| `filePatterns`    | `FilePattern[]`  | (Optional) Patterns controlling file processing mode: `per-hunk` (default analysis), `whole-file`, or `skip` |
| `coalesce`        | `CoalesceConfig` | (Optional) Hunk merging settings (see above)                                                                 |
| `maxContextFiles` | `number`         | Maximum number of other changed files to mention in the prompt (default: 50, 0 disables)                     |

---

### `Defaults`

**What it is:** Global fallback settings that apply to all skills unless overridden at the skill or trigger level.
Lives under `[defaults]` in `warden.toml`.

| Field                 | Type                  | Description                                                                                                                |
| --------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `failOn`              | `SeverityThreshold`   | Severity threshold that fails the CI check (e.g. `"high"` means only high findings fail). Use `"off"` to disable.          |
| `reportOn`            | `SeverityThreshold`   | Only report findings at or above this severity (e.g. `"medium"` means medium + high are reported). Use `"off"` to disable. |
| `maxFindings`         | `number`              | Cap on how many findings to report per skill run                                                                           |
| `reportOnSuccess`     | `boolean`             | (Optional) Report even when there are no findings (default: `false`)                                                       |
| `requestChanges`      | `boolean`             | (Optional) Use `REQUEST_CHANGES` review event when findings exceed `failOn` (default: `false`)                             |
| `failCheck`           | `boolean`             | (Optional) Fail the GitHub Check Run when findings exceed `failOn` (default: `false`)                                      |
| `model`               | `string`              | Default Claude model for all skills (e.g. `"claude-sonnet-4-20250514"`)                                                    |
| `maxTurns`            | `number`              | Max agentic turns (API round-trips) per hunk analysis (default: 50)                                                        |
| `minConfidence`       | `ConfidenceThreshold` | Minimum confidence level to report (`"off"`, `"low"`, `"medium"`, or `"high"`)                                             |
| `ignorePaths`         | `string[]`            | Glob patterns to skip entirely (e.g. `["dist/**", "evals/**"]`)                                                            |
| `defaultBranch`       | `string`              | (Optional) Default branch for the repo. Auto-detected if not specified.                                                    |
| `chunking`            | `ChunkingConfig`      | Diff preparation settings                                                                                                  |
| `batchDelayMs`        | `number`              | (Optional) Delay between batch starts when processing files in parallel (default: 0)                                       |
| `auxiliaryMaxRetries` | `number`              | (Optional) Max retries for auxiliary Haiku calls (extraction repair, dedup, etc.). Default: 5                              |

> **Relationship:** `WardenConfig → Defaults` and `Defaults → ChunkingConfig → CoalesceConfig`

---

### `SkillConfig`

**What it is:** One `[[skills]]` entry in `warden.toml`. Configures a single skill — where it runs, on which files, and with what settings.

| Field         | Type             | Description                                                                       |
| ------------- | ---------------- | --------------------------------------------------------------------------------- |
| `name`        | `string`         | The skill identifier (must match a SKILL.md file name, e.g. `"find-warden-bugs"`) |
| `paths`       | `string[]`       | Glob patterns for files this skill analyzes (e.g. `["src/**/*.ts"]`)              |
| `ignorePaths` | `string[]`       | (Optional) Additional paths to skip for this skill only                           |
| `remote`      | `string`         | (Optional) Load SKILL.md from another repo (e.g. `"getsentry/sentry-skills"`)     |
| `triggers`    | `SkillTrigger[]` | Which events fire this skill and their settings                                   |
| `model`       | `string`         | (Optional) Override the model for this skill only                                 |
| `failOn`      | `string`         | (Optional) Override the fail threshold for this skill only                        |
| `reportOn`    | `string`         | (Optional) Override the report threshold for this skill only                      |

> **Relationship:** `SkillConfig → SkillTrigger[]`

---

### `WardenConfig`

**What it is:** The root config object, parsed from `warden.toml`. Everything flows from here.

| Field      | Type            | Description                                                   |
| ---------- | --------------- | ------------------------------------------------------------- |
| `version`  | `1` (literal)   | Config file format version — always the number `1`            |
| `defaults` | `Defaults`      | (Optional) Global fallback settings                           |
| `skills`   | `SkillConfig[]` | All skills configured for this repo (default: empty array)    |
| `runner`   | `RunnerConfig`  | (Optional) Runner-level settings (concurrency)                |
| `logs`     | `LogsConfig`    | (Optional) Log output settings (cleanup mode, retention days) |

> **Relationship:** `WardenConfig → Defaults`, `WardenConfig → SkillConfig[]`

---

### `SkillDefinition`

**What it is:** The _loaded_ content of a SKILL.md file — what Claude actually reads. Distinct from `SkillConfig` (which is what's in `warden.toml`).

| Field         | Type         | Description                                                                                                                                                                |
| ------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | `string`     | Skill identifier                                                                                                                                                           |
| `description` | `string`     | One-line description from the SKILL.md YAML frontmatter                                                                                                                    |
| `prompt`      | `string`     | The full instruction body from SKILL.md — this is injected into the system prompt                                                                                          |
| `tools`       | `ToolConfig` | (Optional) Object with `allowed?: ToolName[]` and `denied?: ToolName[]` lists. Valid tool names: `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, `WebFetch`, `WebSearch`. |
| `rootDir`     | `string`     | (Optional) Absolute path to the directory this skill was loaded from, for resolving `resources/`, `scripts/`, `references/`                                                |

---

## Diff Pipeline Types (from `src/sdk/prepare.ts` and `src/diff/`)

These types represent a diff moving through the preparation pipeline before being sent to Claude.

### `DiffHunk`

**What it is:** A single contiguous block of changed lines from a diff — the raw output of `git diff` parsing.

| Field      | Type       | Description                                                                              |
| ---------- | ---------- | ---------------------------------------------------------------------------------------- |
| `oldStart` | `number`   | Start line in the original file                                                          |
| `oldCount` | `number`   | Number of lines from the original file                                                   |
| `newStart` | `number`   | Start line in the new file                                                               |
| `newCount` | `number`   | Number of lines in the new file                                                          |
| `header`   | `string`   | (Optional) Function/class context from the `@@` header (e.g. `function doThing()`)       |
| `content`  | `string`   | Raw hunk content including the `@@` header line                                          |
| `lines`    | `string[]` | Just the changed lines (without the `@@` header) — each prefixed with `+`, `-`, or space |

---

### `HunkWithContext`

**What it is:** A `DiffHunk` after context lines (unchanged code around it) have been added. Claude needs surrounding code to understand what a change does.

| Field              | Type       | Description                                                                         |
| ------------------ | ---------- | ----------------------------------------------------------------------------------- |
| `filename`         | `string`   | File path this hunk belongs to                                                      |
| `hunk`             | `DiffHunk` | The raw diff hunk                                                                   |
| `contextBefore`    | `string[]` | Array of unchanged code lines immediately before the hunk (~20 lines)               |
| `contextAfter`     | `string[]` | Array of unchanged code lines immediately after the hunk (~20 lines)                |
| `contextStartLine` | `number`   | Line number where `contextBefore` starts (helps Claude map findings to exact lines) |
| `language`         | `string`   | Detected programming language from file extension (e.g. `"typescript"`, `"python"`) |

> **Relationship:** `HunkWithContext → DiffHunk`

---

### `PreparedFile`

**What it is:** A fully prepared file ready to be analyzed by Claude. Contains all its hunks (coalesced and context-expanded).

| Field      | Type                | Description                            |
| ---------- | ------------------- | -------------------------------------- |
| `filename` | `string`            | File path                              |
| `hunks`    | `HunkWithContext[]` | All analysis-ready hunks for this file |

> **Note:** The list of other changed files for cross-reference is provided separately via `PRPromptContext.changedFiles` at prompt-build time, not stored on this type.

> **Relationship:** `PreparedFile → HunkWithContext[]`

---

### `HunkAnalysisResult`

**What it is:** The result of sending one hunk to Claude. Contains what Claude found and what went wrong (if anything).

| Field               | Type                    | Description                                                                  |
| ------------------- | ----------------------- | ---------------------------------------------------------------------------- |
| `findings`          | `Finding[]`             | Findings detected in this hunk                                               |
| `usage`             | `UsageStats`            | Token/cost usage for this single Claude call                                 |
| `failed`            | `boolean`               | Whether the hunk analysis itself failed (SDK error, API error, abort)        |
| `extractionFailed`  | `boolean`               | Whether findings extraction failed (both regex and LLM repair failed)        |
| `extractionError`   | `string`                | (Optional) Error message if extraction failed                                |
| `extractionPreview` | `string`                | (Optional) Preview of the output that failed to parse                        |
| `auxiliaryUsage`    | `AuxiliaryUsageEntry[]` | (Optional) Usage from auxiliary LLM calls (e.g. extraction repair via Haiku) |

---

## Execution Types (from `src/action/triggers/executor.ts`)

### `ResolvedTrigger`

**What it is:** The result of matching the current event against `warden.toml` triggers. A flattened merge of skill config + trigger config + defaults, ready to execute. Defined in `src/config/loader.ts`.

| Field             | Type                                           | Description                                                                    |
| ----------------- | ---------------------------------------------- | ------------------------------------------------------------------------------ |
| `name`            | `string`                                       | Display name used for the GitHub Check (e.g. `"find-warden-bugs"`)             |
| `skill`           | `string`                                       | Skill reference (same as `name`, for downstream compatibility)                 |
| `type`            | `TriggerType \| "*"`                           | The trigger type that matched, or `"*"` for wildcard (runs on all event types) |
| `actions`         | `string[]`                                     | (Optional) Actions for pull_request triggers                                   |
| `remote`          | `string`                                       | (Optional) Remote repo reference for the skill                                 |
| `filters`         | `{ paths?: string[]; ignorePaths?: string[] }` | Path include/exclude filters                                                   |
| `failOn`          | `SeverityThreshold`                            | (Optional) Merged fail threshold (trigger > skill > defaults)                  |
| `reportOn`        | `SeverityThreshold`                            | (Optional) Merged report threshold                                             |
| `maxFindings`     | `number`                                       | (Optional) Merged max findings cap                                             |
| `reportOnSuccess` | `boolean`                                      | (Optional) Post review even with zero findings                                 |
| `requestChanges`  | `boolean`                                      | (Optional) Use `REQUEST_CHANGES` review event                                  |
| `failCheck`       | `boolean`                                      | (Optional) Fail the GitHub Check Run                                           |
| `model`           | `string`                                       | (Optional) Merged model (trigger > skill > defaults > CLI > env)               |
| `maxTurns`        | `number`                                       | (Optional) Merged max agentic turns per hunk                                   |
| `minConfidence`   | `ConfidenceThreshold`                          | (Optional) Merged minimum confidence for findings                              |
| `schedule`        | `ScheduleConfig`                               | (Optional) Schedule-specific configuration                                     |

> **Note:** Unlike the earlier description, `ResolvedTrigger` does NOT contain a `SkillDefinition`. The SKILL.md is loaded lazily later by the executor using `resolveSkillAsync()`.

---

### `TriggerExecutorDeps`

**What it is:** Dependency injection bag — all the external services and config a trigger executor needs to run.

| Field                  | Type                | Description                                                                      |
| ---------------------- | ------------------- | -------------------------------------------------------------------------------- |
| `octokit`              | `Octokit`           | Authenticated GitHub API client                                                  |
| `context`              | `EventContext`      | Current event context (PR info, repo, etc.)                                      |
| `config`               | `WardenConfig`      | Parsed `warden.toml`                                                             |
| `anthropicApiKey`      | `string`            | API key for calling Claude                                                       |
| `claudePath`           | `string`            | Path to the `claude` binary (Claude Code SDK)                                    |
| `globalFailOn`         | `SeverityThreshold` | (Optional) Global fail-on from action inputs (trigger-specific takes precedence) |
| `globalReportOn`       | `SeverityThreshold` | (Optional) Global report-on from action inputs                                   |
| `globalMaxFindings`    | `number`            | Global max-findings from action inputs                                           |
| `globalRequestChanges` | `boolean`           | (Optional) Global request-changes from action inputs                             |
| `globalFailCheck`      | `boolean`           | (Optional) Global fail-check from action inputs                                  |
| `semaphore`            | `Semaphore`         | (Optional) Concurrency limiter — shared across all trigger executors             |

---

### `TriggerResult`

**What it is:** What a trigger executor returns after completing analysis and rendering.

| Field             | Type                  | Description                                                                |
| ----------------- | --------------------- | -------------------------------------------------------------------------- |
| `triggerName`     | `string`              | Name of the trigger that ran                                               |
| `report`          | `SkillReport`         | (Optional) Full skill report, if analysis succeeded                        |
| `renderResult`    | `RenderResult`        | (Optional) Rendered review data, ready to post to GitHub                   |
| `failOn`          | `SeverityThreshold`   | (Optional) The resolved fail threshold                                     |
| `reportOn`        | `SeverityThreshold`   | (Optional) The resolved report threshold                                   |
| `minConfidence`   | `ConfidenceThreshold` | (Optional) Minimum confidence for findings                                 |
| `reportOnSuccess` | `boolean`             | (Optional) Whether to post review with zero findings                       |
| `requestChanges`  | `boolean`             | (Optional) Whether to use `REQUEST_CHANGES`                                |
| `failCheck`       | `boolean`             | (Optional) Whether to fail the GitHub Check Run                            |
| `checkRunUrl`     | `string`              | (Optional) URL to the GitHub Check Run (for linking from filtered reviews) |
| `maxFindings`     | `number`              | (Optional) Cap on findings for this trigger                                |
| `error`           | `unknown`             | (Optional) Error if trigger execution failed                               |

> **Relationship:** `TriggerResult → SkillReport`, `TriggerResult → RenderResult`

---

### `RenderResult`

**What it is:** The formatted output ready to post to GitHub. Contains an optional full PR review with inline comments, plus a summary comment.

| Field            | Type           | Description                                                                                                                                                             |
| ---------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `review`         | `GitHubReview` | (Optional) A complete PR review object: `{ event: "APPROVE" \| "REQUEST_CHANGES" \| "COMMENT", body: string, comments: GitHubComment[] }`. Absent if nothing to report. |
| `summaryComment` | `string`       | A standalone summary comment posted to the PR timeline. Always present.                                                                                                 |

> `GitHubComment` has: `{ body, path?, line?, side?, start_line?, start_side? }` — these fields position the comment on specific diff lines.

---

## Concurrency Types (from `src/utils/async.ts`)

### `Semaphore`

**What it is:** A concurrency gate — limits how many Claude API calls can run simultaneously to avoid rate-limiting and resource exhaustion.

| Field/Method  | Type            | Description                                     |
| ------------- | --------------- | ----------------------------------------------- |
| `concurrency` | `number`        | Maximum number of simultaneous operations       |
| `acquire()`   | `Promise<void>` | Wait until a slot is available, then claim it   |
| `release()`   | `void`          | Release the slot so the next waiter can proceed |

**Example:** If `concurrency = 5`, at most 5 files are analyzed in parallel. The 6th waits until one finishes.

---

### `ActionInputs`

**What it is:** Parsed GitHub Action input parameters — what gets passed to the action via the workflow YAML.

| Field             | Type     | Description                                                        |
| ----------------- | -------- | ------------------------------------------------------------------ |
| `wardenTomlPath`  | `string` | Path to the config file (default: `warden.toml`)                   |
| `anthropicApiKey` | `string` | Anthropic API key from GitHub secrets                              |
| `claudePath`      | `string` | Path to the `claude` binary (bundled with the action)              |
| `githubToken`     | `string` | GitHub token for API calls (from `create-github-app-token` action) |
| `model`           | `string` | (Optional) Override Claude model from workflow level               |

---

## Relationship Summary

```
WardenConfig                      (root config from warden.toml)
  ├── Defaults                    (global fallbacks)
  │     └── ChunkingConfig
  │           └── CoalesceConfig  (hunk merging rules)
  └── SkillConfig[]               (one per [[skills]] entry)
        └── SkillTrigger[]        (when to run)

ResolvedTrigger                   (runtime: merged skill + trigger + defaults)
  ├── flattened config fields      (failOn, reportOn, model, maxTurns, etc.)
  └── filters { paths, ignorePaths }  (path include/exclude)

PreparedFile                      (fully processed diff, ready for Claude)
  └── HunkWithContext[]
        └── DiffHunk              (raw diff block)

TriggerExecutorDeps               (injected dependencies for execution)
  ├── WardenConfig
  ├── EventContext
  └── Semaphore                   (concurrency gate)

TriggerResult                     (output of one trigger run)
  ├── SkillReport
  └── RenderResult
```
