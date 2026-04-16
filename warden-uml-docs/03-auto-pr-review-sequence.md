# Diagram 3 — Automated GitHub Action PR Review Sequence Reference

**Corresponding diagram:** Diagram 3 in `warden-uml-diagrams.html`
**This is the most important flow** — it's what happens every time someone opens or updates a pull request on GitHub.

The diagram has numbered steps (1–50+). This document explains every **actor** (the boxes at the top), every **phase** (the colored bands), and every **notable step**.

---

## Actors (Diagram Participants)

These are the "swimlanes" across the top of the sequence diagram.

| Short Code | Full Name                              | What It Is                                                                                   |
| ---------- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| `GH`       | **GitHub Event**                       | The external trigger — represents GitHub's webhook system firing when a PR is opened/updated |
| `WF`       | **.github/workflows/warden.yml**       | The GitHub Actions workflow file that boots the CI environment and runs the action           |
| `MA`       | **src/action/main.ts**                 | Entry point of the Warden GitHub Action. Routes to the correct workflow (PR vs schedule).    |
| `PW`       | **src/action/workflow/pr-workflow.ts** | The main PR orchestrator. Runs the 4-phase workflow sequentially.                            |
| `CL`       | **src/config/loader.ts**               | Reads and validates `warden.toml` from the repo.                                             |
| `EC`       | **src/event/context.ts**               | Builds the `EventContext` object — fetches PR file list from GitHub API.                     |
| `TM`       | **src/triggers/matcher.ts**            | Matches the current event against all configured triggers in `warden.toml`.                  |
| `GC`       | **GitHub Checks API**                  | The GitHub API endpoint for creating and updating Check Runs (the status boxes on a PR).     |
| `TE`       | **src/action/triggers/executor.ts**    | Executes one trigger — loads skill, prepares diff, runs analysis, renders output.            |
| `SK`       | **src/skills/ (SKILL.md)**             | The skill instruction file loaded from the filesystem (or remote repo).                      |
| `PF`       | **src/sdk/prepare.ts**                 | Transforms raw diff patches into `PreparedFile[]` with context and coalescing.               |
| `AN`       | **src/sdk/analyze.ts**                 | Core analysis engine — builds prompts, calls Claude, extracts findings.                      |
| `PR`       | **src/sdk/prompt.ts**                  | Builds the system prompt and user prompt for each Claude call.                               |
| `AI`       | **Anthropic Claude API**               | The external AI service. Receives prompts and returns findings as JSON.                      |
| `OR`       | **src/output/renderer.ts**             | Converts a `SkillReport` into human-readable markdown + inline comments.                     |
| `DE`       | **src/output/dedup.ts**                | Deduplicates findings across multiple trigger results (same finding, multiple triggers).     |
| `RV`       | **GitHub PR Reviews API**              | The GitHub API endpoint for posting review comments on a PR.                                 |
| `FE`       | **src/action/fix-evaluation/**         | Evaluates whether findings from previous runs have been fixed in the current commit.         |

---

## Phases

The diagram is divided into 4 colored bands, matching the 4 phases of `pr-workflow.ts`.

---

### Phase 1 — Initialize (Steps 5–13)

**Goal:** Load config, build context, figure out which skills need to run.

| Step      | What Happens                                                                 | Why                                                                                    |
| --------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `MA → PW` | `main.ts` detects this is a `pull_request` event and calls `runPRWorkflow()` | The router distinguishes PR vs schedule vs manual dispatch                             |
| `PW → CL` | Load `warden.toml`                                                           | Reads the repo's configuration — which skills, thresholds, paths to analyze            |
| `CL → PW` | Returns `WardenConfig`                                                       | Config is now validated and available                                                  |
| `PW → EC` | Build event context                                                          | Need to know the PR number, files changed, and repo details                            |
| `EC → GH` | `GET /repos/:owner/:repo/pulls/:number/files`                                | Fetches the list of all changed files and their patches from GitHub API                |
| `GH → EC` | Returns `FileChange[]`                                                       | Raw file change data including diff patches                                            |
| `EC → PW` | Returns `EventContext`                                                       | Fully built context: event type, PR details, repo info, file changes                   |
| `PW → TM` | Match triggers                                                               | Look at all `[[skills]]` entries in config and find which ones fire for `pull_request` |
| `TM → PW` | Returns `ResolvedTrigger[]`                                                  | List of skills that need to run, with their SKILL.md definitions loaded                |

---

### Phase 2 — Create GitHub Checks (Steps 14–16)

**Goal:** Register a Check Run for each skill so GitHub shows a "pending" status on the PR immediately.

| Step             | What Happens                                    | Why                                                                      |
| ---------------- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| `PW → GC` (loop) | `createCheck(trigger.name, status=in_progress)` | Creates a yellow "in progress" status indicator on the PR for each skill |
| `GC → PW`        | Returns `checkRunId`                            | Warden stores this ID to update the check later when analysis finishes   |

> **Why this matters:** Users see the check appear instantly, so they know Warden is working — even before analysis finishes.

---

### Phase 3 — Execute Triggers (Steps 17–47)

**Goal:** Actually run each skill — prepare diffs, call Claude, extract findings.

This is the most complex phase. It runs all triggers **in parallel** using `runPool`.

#### For each trigger (parallel):

**Step: Load Skill**
| Step | What Happens |
|------|-------------|
| `TE → SK` | Load the SKILL.md file for this skill |
| `SK → TE` | Returns `SkillDefinition` — name, description, full prompt text, allowed tools |

**Step: Prepare Files**
| Step | What Happens |
|------|-------------|
| `TE → PF` | Prepare the diff for this skill's file patterns |
| `PF → PF: parsePatches()` | Convert raw patch strings into `DiffHunk[]` objects |
| `PF → PF: splitLargeHunks()` | If a hunk is too large (>8000 chars), split it into smaller pieces |
| `PF → PF: coalesceNearbyHunks()` | Merge hunks that are within 30 lines of each other (reduces API calls, gives more context) |
| `PF → PF: expandContext()` | Add ~20 lines of unchanged code before/after each hunk |
| `PF → PF: groupHunksByFile()` | Group hunks back by filename → `PreparedFile[]` |
| `PF → TE` | Returns `PreparedFile[]` — fully prepared, ready for Claude |

**Step: Analyze Files (runPool concurrency)**
For each `PreparedFile`, for each `HunkWithContext`:

| Step                                                   | What Happens                                 | Why                                                                                                                           |
| ------------------------------------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `AN → PR: buildHunkSystemPrompt(skill)`                | Assemble the system prompt                   | Includes `<role>`, `<skill_instructions>` (the SKILL.md body), `<output_format>` (JSON schema), `<verification>` instructions |
| `AN → PR: buildHunkUserPrompt(skill, hunk, prContext)` | Assemble the user prompt                     | Includes PR title, PR description, list of other changed files, and the actual diff code                                      |
| `AN → AI: query(...)`                                  | Send to Claude with tools=[Read, Grep, Glob] | Claude can read files for extra context but cannot write or execute code                                                      |
| `AI → AN`                                              | Returns raw message content                  | Usually a JSON array of findings wrapped in a markdown code block                                                             |
| `AN → AN: extractFindingsJson()`                       | Parse the JSON out of Claude's response      | Claude wraps JSON in markdown — this strips the wrapper and parses the array                                                  |
| (if JSON malformed) `AN → AI`                          | Repair prompt using Haiku model              | If Claude returns malformed JSON, a smaller/cheaper model tries to fix it                                                     |
| `AN → AN: filterOutOfRangeFindings()`                  | Drop findings outside the hunk's line range  | Defense-in-depth: Claude sometimes reports lines that aren't in the diff                                                      |
| `AN → AN: normalizeSeverity()`                         | `critical→high`, `info→low`                  | Standardize non-standard severity labels Claude might return                                                                  |
| `AN → TE`                                              | Returns `HunkAnalysisResult`                 | Findings + usage stats for this hunk                                                                                          |

**Step: Render**
| Step | What Happens |
|------|-------------|
| `TE → OR` | Convert the `SkillReport` to markdown + inline comments |
| `OR → TE` | Returns `RenderResult` with optional `review` (GitHubReview) and `summaryComment` |
| `TE → PW` | Returns `TriggerResult` |

---

### Phase 4 — Post Reviews and Finalize (Steps 48–56)

**Goal:** Post findings to GitHub, resolve stale comments, update Check status.

| Step                              | What Happens                                           | Why                                                                     |
| --------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------- |
| `PW → DE`                         | Deduplicate findings across all trigger results        | Multiple skills might detect the same issue — dedup by finding ID       |
| `DE → PW`                         | Returns deduplicated findings                          |                                                                         |
| `PW → RV`                         | `listExistingComments(pr.number)`                      | Fetch existing Warden comments on this PR from previous runs            |
| `RV → PW`                         | Returns `ExistingComment[]`                            | Previous comments Warden posted                                         |
| `PW → PW: resolveStaleComments()` | Compare old vs new findings                            | Old finding no longer present? → mark that comment as resolved/outdated |
| `PW → RV` (loop)                  | `dismissComment(commentId)`                            | Remove or resolve comments for findings that no longer exist            |
| `PW → RV`                         | `createReview(pr.number, comments, summary)`           | Post all new findings as a GitHub PR Review with inline comments        |
| `RV → PW`                         | Review created                                         |                                                                         |
| `PW → FE`                         | `evaluateFixes(previousFindings, currentFindings)`     | Check which findings from the last run are now fixed                    |
| `FE → PW`                         | Returns `FixStatus` per finding                        | `not_attempted`, `attempted_failed`, or `resolved`                      |
| `PW → GC` (loop)                  | `updateCheck(id, conclusion=success/failure, summary)` | Update each Check Run from "in progress" to green ✓ or red ✗            |
| `MA → GH`                         | Action exits 0 (pass) or 1 (fail)                      | Exit code determined by whether any `failOn`-level findings were found  |

---

## Key Concepts

### Why is the diff coalesced before sending to Claude?

Nearby hunks that are coalesced give Claude more connected context. If lines 10–15 and lines 20–25 both changed, merging them into one chunk means Claude sees the relationship, rather than two isolated fragments.

### Why does `filterOutOfRangeFindings` exist?

Claude sometimes reports a line number that's outside the changed lines. This is a hallucination guard — findings must point to lines that are actually in the diff, or they're discarded.

### What does `failOn` vs `reportOn` mean?

- `reportOn = "medium"` → post medium and high findings as comments
- `failOn = "high"` → only fail the CI check (exit code 1) for high findings

A finding below `reportOn` is silently ignored. A finding above `reportOn` but below `failOn` is reported but doesn't block the PR.

### What is fix-evaluation?

After each run, Warden stores findings. On the next run (next commit push), the fix-evaluator compares old findings with new ones. If an old finding disappears from the diff, it marks it as `fixed` and visually updates the comment.

---

## Flow at a Glance

```
GitHub Event
  └── warden.yml boots CI
        └── action/main.ts (entry)
              └── pr-workflow.ts (orchestrator)
                    ├── Phase 1: Load config + build context + match triggers
                    ├── Phase 2: Create "in progress" GitHub Checks
                    ├── Phase 3: For each trigger (parallel)
                    │     └── executor.ts
                    │           ├── Load SKILL.md
                    │           ├── prepare.ts → PreparedFile[]
                    │           ├── analyze.ts → Claude API (per hunk)
                    │           └── renderer.ts → RenderResult
                    └── Phase 4: Dedup → Post PR Review → Fix-eval → Update Checks
```
