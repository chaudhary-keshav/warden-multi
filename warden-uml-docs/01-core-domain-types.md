# Diagram 1 — Core Domain Types Reference

**Corresponding diagram:** Diagram 1 in `warden-uml-diagrams.html`
**Source file:** `src/types/index.ts`

This class diagram shows all the fundamental data shapes that flow through every part of Warden —
from the moment a diff is received to the moment a GitHub comment is posted.

---

## Enumerations

### `Severity`

**What it is:** A tag on a Finding that says how serious the problem is.

| Value    | Meaning                                                                       |
| -------- | ----------------------------------------------------------------------------- |
| `high`   | Serious bug, security hole, or data-loss risk. Warden will fail the CI check. |
| `medium` | Probable bug or bad practice. Reported but does not fail CI by default.       |
| `low`    | Possible issue or style concern. Informational only.                          |

> **Normalization rule:** Claude sometimes returns `"critical"` or `"info"`, which are not valid values.
> Warden normalizes: `critical → high`, `info → low`.

---

### `Confidence`

**What it is:** A tag on a Finding that says how sure Claude is about the finding.

| Value    | Meaning                                                      |
| -------- | ------------------------------------------------------------ |
| `high`   | Claude has strong evidence. Almost certainly a real bug.     |
| `medium` | Likely an issue but depends on code not visible in the diff. |
| `low`    | Speculative. May be a false positive.                        |

> `minConfidence` in `warden.toml` filters out findings below a threshold before reporting.

---

## Core Output Types

### `Location`

**What it is:** Pinpoints exactly where in a file a Finding was detected.

| Field       | Type     | Description                                                           |
| ----------- | -------- | --------------------------------------------------------------------- |
| `path`      | `string` | Relative repo path, e.g. `src/cli/fix.ts`                             |
| `startLine` | `number` | First line of the problematic code (1-based)                          |
| `endLine`   | `number` | Last line of the problematic code (optional, defaults to `startLine`) |

---

### `SuggestedFix`

**What it is:** An optional code snippet Claude proposes as a correction.

| Field         | Type     | Description                                                         |
| ------------- | -------- | ------------------------------------------------------------------- |
| `description` | `string` | Plain-English explanation of what to change and why                 |
| `diff`        | `string` | The fix in unified diff format — shows exactly what lines to change |

---

### `Finding`

**What it is:** The single most important type in Warden. Represents one detected issue.

| Field                 | Type           | Description                                                                                             |
| --------------------- | -------------- | ------------------------------------------------------------------------------------------------------- |
| `id`                  | `string`       | Stable hash — `sha256(title + path + line)[:8]` prefixed with skill name. Used for deduplication.       |
| `severity`            | `Severity`     | How serious (`high / medium / low`)                                                                     |
| `confidence`          | `Confidence`   | (Optional) How certain (`high / medium / low`). Absent in older JSONL logs — always included in output. |
| `title`               | `string`       | Short one-line label shown in the PR comment header                                                     |
| `description`         | `string`       | Full explanation of the problem and its impact                                                          |
| `verification`        | `string`       | (Optional) Steps Claude used to verify the finding. Shown in the review.                                |
| `location`            | `Location`     | (Optional) File path and line range. Used to post inline PR comments at the right line.                 |
| `additionalLocations` | `Location[]`   | (Optional) Other related locations — e.g. callers or callees also affected.                             |
| `suggestedFix`        | `SuggestedFix` | (Optional) Claude's proposed code correction in unified diff format.                                    |
| `elapsedMs`           | `number`       | (Optional) Time Claude spent analyzing the hunk that produced this finding.                             |

> **Relationship:** `Finding → Location (optional)`, `Finding → Location[] (additionalLocations)`, `Finding → SuggestedFix (optional)`

---

### `UsageStats`

**What it is:** Token and cost accounting for a single Claude API call or an entire skill run.

| Field                      | Type     | Description                                                                     |
| -------------------------- | -------- | ------------------------------------------------------------------------------- |
| `inputTokens`              | `number` | Tokens sent to Claude (prompt + context)                                        |
| `outputTokens`             | `number` | Tokens returned by Claude (findings JSON)                                       |
| `cacheReadInputTokens`     | `number` | (Optional) Tokens served from Claude's prompt cache — cheaper than fresh tokens |
| `cacheCreationInputTokens` | `number` | (Optional) Tokens that were written into the prompt cache for the first time    |
| `costUSD`                  | `number` | Total USD cost for this call (calculated from token counts × model pricing)     |

---

### `SkippedFile`

**What it is:** A record of a file that was excluded from analysis.

| Field      | Type                       | Description                                                                                                                                |
| ---------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `filename` | `string`                   | The file path that was skipped                                                                                                             |
| `reason`   | `"pattern"` or `"builtin"` | Why it was skipped — `"pattern"` means it matched a `filePatterns` skip rule; `"builtin"` means it was filtered by Warden's built-in logic |
| `pattern`  | `string`                   | (Optional) The glob pattern that caused the skip (only when `reason = "pattern"`)                                                          |

---

### `FileReport`

**What it is:** Per-file summary within a `SkillReport`. Contains counts and timing, not the findings themselves (findings live in the parent `SkillReport.findings` array).

| Field          | Type         | Description                                        |
| -------------- | ------------ | -------------------------------------------------- |
| `filename`     | `string`     | The file path                                      |
| `findingCount` | `number`     | Number of findings detected in this file           |
| `durationMs`   | `number`     | (Optional) How long analysis of this file took     |
| `usage`        | `UsageStats` | (Optional) Token/cost usage for this specific file |

---

### `SkillReport`

**What it is:** The complete result of running one skill against a diff. Everything that happened — findings, cost, timing.

| Field               | Type                         | Description                                                                                           |
| ------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| `skill`             | `string`                     | Name of the skill that ran (e.g. `"find-warden-bugs"`)                                                |
| `summary`           | `string`                     | Human-readable one-paragraph summary of what was found                                                |
| `findings`          | `Finding[]`                  | All findings from all files and all hunks, deduplicated                                               |
| `metadata`          | `Record<string, unknown>`    | (Optional) Arbitrary metadata attached by the runner                                                  |
| `durationMs`        | `number`                     | (Optional) How long the entire skill run took in milliseconds                                         |
| `usage`             | `UsageStats`                 | (Optional) Aggregate token/cost usage across the entire run                                           |
| `skippedFiles`      | `SkippedFile[]`              | (Optional) Files excluded from analysis due to chunking patterns                                      |
| `failedHunks`       | `number`                     | (Optional) Count of hunks where Claude failed to analyze (SDK/API errors)                             |
| `failedExtractions` | `number`                     | (Optional) Count of hunks where JSON findings extraction failed (both regex and LLM repair)           |
| `auxiliaryUsage`    | `Record<string, UsageStats>` | (Optional) Token usage from non-primary LLM calls (extraction repair, semantic dedup, fix evaluation) |
| `files`             | `FileReport[]`               | (Optional) Per-file breakdown of finding counts, timing, and usage                                    |
| `model`             | `string`                     | (Optional) The Claude model that was used (e.g. `"claude-sonnet-4-20250514"`)                         |

> **Relationship:** `SkillReport → Finding[]`, `SkillReport → UsageStats`, `SkillReport → FileReport[]`, `SkillReport → SkippedFile[]`

---

## Context Types

### `RepositoryContext`

**What it is:** Identifies which GitHub repository is being reviewed.

| Field           | Type     | Description                                                   |
| --------------- | -------- | ------------------------------------------------------------- |
| `owner`         | `string` | GitHub org or user (e.g. `"getsentry"`)                       |
| `name`          | `string` | Repo name (e.g. `"warden"`)                                   |
| `fullName`      | `string` | Combined `owner/name` (e.g. `"getsentry/warden"`)             |
| `defaultBranch` | `string` | The repository's default branch (e.g. `"main"` or `"master"`) |

---

### `FileChange`

**What it is:** Represents one changed file inside a pull request, as returned by the GitHub API.

| Field       | Type     | Description                                                                                       |
| ----------- | -------- | ------------------------------------------------------------------------------------------------- |
| `filename`  | `string` | Relative path of the file                                                                         |
| `status`    | `string` | One of: `"added"`, `"removed"`, `"modified"`, `"renamed"`, `"copied"`, `"changed"`, `"unchanged"` |
| `additions` | `number` | Number of lines added                                                                             |
| `deletions` | `number` | Number of lines removed                                                                           |
| `patch`     | `string` | (Optional) The raw unified diff string for this file                                              |
| `chunks`    | `number` | (Optional) Number of diff hunks in this file's patch                                              |

---

### `PullRequestContext`

**What it is:** Everything Warden knows about the PR under review.

| Field        | Type             | Description                                                                                 |
| ------------ | ---------------- | ------------------------------------------------------------------------------------------- |
| `number`     | `number`         | PR number (e.g. `42`)                                                                       |
| `title`      | `string`         | PR title — injected into the system prompt so Claude understands intent                     |
| `body`       | `string \| null` | PR description — also injected into prompts for context. Null if the PR has no description. |
| `author`     | `string`         | GitHub username of the PR author                                                            |
| `baseBranch` | `string`         | Name of the base branch (e.g. `"main"`)                                                     |
| `headBranch` | `string`         | Name of the PR's head branch (e.g. `"fix/null-check"`)                                      |
| `baseSha`    | `string`         | Git SHA of the base branch (what the PR branches off)                                       |
| `headSha`    | `string`         | Git SHA of the PR head commit                                                               |
| `files`      | `FileChange[]`   | All files changed in the PR                                                                 |

> **Relationship:** `PullRequestContext → FileChange[]`

---

### `GitHubEventType`

**What it is:** The type of GitHub event that triggered Warden.

| Value                         | When it fires                            |
| ----------------------------- | ---------------------------------------- |
| `pull_request`                | A PR was opened, updated, or reopened    |
| `issues`                      | An issue was opened, edited, or labeled  |
| `issue_comment`               | A comment was posted on an issue or PR   |
| `pull_request_review`         | A PR review was submitted                |
| `pull_request_review_comment` | A comment was posted in the PR diff view |
| `schedule`                    | A cron job triggered the action          |

---

### `EventContext`

**What it is:** The top-level context object passed through every layer of Warden. Contains everything needed to understand _what_ is being reviewed.

| Field         | Type                 | Description                                                    |
| ------------- | -------------------- | -------------------------------------------------------------- |
| `eventType`   | `GitHubEventType`    | Which event triggered this run                                 |
| `action`      | `string`             | Sub-action (e.g. `"opened"`, `"synchronize"`)                  |
| `repository`  | `RepositoryContext`  | Which repo                                                     |
| `pullRequest` | `PullRequestContext` | (Optional) PR details — absent for `push` or `schedule` events |
| `repoPath`    | `string`             | Absolute local path to the checked-out repo                    |

> **Relationship:** `EventContext → RepositoryContext`, `EventContext → PullRequestContext (optional)`, `EventContext → GitHubEventType`

---

## Supporting Types

### `RetryConfig`

**What it is:** Parameters for exponential-backoff retry logic when Claude API calls fail or return malformed JSON.

| Field               | Type     | Description                                         |
| ------------------- | -------- | --------------------------------------------------- |
| `maxRetries`        | `number` | Maximum number of retry attempts (default: 3)       |
| `initialDelayMs`    | `number` | Wait time before the first retry (e.g. 1000ms)      |
| `backoffMultiplier` | `number` | Multiplier applied each retry (e.g. 2 → 1s, 2s, 4s) |
| `maxDelayMs`        | `number` | Cap on wait time so retries don't stall forever     |

---

### `FixStatus`

**What it is:** The verdict from the fix-evaluation system — did a previous finding get addressed in the latest commit?

| Value              | Meaning                                           |
| ------------------ | ------------------------------------------------- |
| `not_attempted`    | No fix was attempted for this finding             |
| `attempted_failed` | A fix was attempted but the finding persists      |
| `resolved`         | The finding has been resolved (no longer appears) |

---

## Relationship Summary

```
EventContext
  ├── RepositoryContext         (which repo, including defaultBranch)
  └── PullRequestContext        (which PR)
        └── FileChange[]        (changed files with raw patches)

SkillReport                    (result of one skill run)
  ├── Finding[]                 (all detected issues)
  │     ├── Location            (file + lines)
  │     ├── Location[]          (additionalLocations — related code sites)
  │     └── SuggestedFix        (optional code fix as unified diff)
  ├── UsageStats                (tokens + cost)
  ├── FileReport[]              (per-file count/timing/usage breakdown)
  ├── SkippedFile[]             (files excluded from analysis)
  └── auxiliaryUsage            (extraction repair, dedup token costs)

FileReport                     (per-file stats — NOT findings)
  └── findingCount, durationMs, usage
```
