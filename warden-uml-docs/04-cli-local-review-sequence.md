# Diagram 4 — CLI Local Review Sequence Reference

**Corresponding diagram:** Diagram 4 in `warden-uml-diagrams.html`
**Trigger:** A developer runs `warden scan <file>` from their terminal (no GitHub involved).

This is the **local developer workflow** — identical analysis engine to the GitHub Action, but runs on a developer's machine against their current branch diff, with an optional interactive fix mode.

---

## Actors (Diagram Participants)

| Short Code | Full Name                     | What It Is                                                                                                                                             |
| ---------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `U`        | **User / Terminal**           | The developer running the `warden` CLI command                                                                                                         |
| `CM`       | **src/cli/main.ts**           | CLI entry point — parses args, orchestrates the local scan workflow                                                                                    |
| `AR`       | **src/cli/args.ts**           | Parses command-line arguments into a typed `ParsedArgs` object                                                                                         |
| `IN`       | **src/cli/context.ts**        | Builds the `EventContext` for local mode — runs `git diff` to get the diff                                                                             |
| `GT`       | **src/cli/git.ts**            | Runs `git` commands — specifically `git diff HEAD~1 -- <file>` to get the file's changes                                                               |
| `CS`       | **src/cli/main.ts**           | The main scan orchestrator — coordinates skill loading, preparation, analysis (scan logic lives directly in `main.ts`, not in a separate command file) |
| `CF`       | **src/config/loader.ts**      | Reads and validates `warden.toml` (same as the Action)                                                                                                 |
| `SK`       | **src/skills/ (SKILL.md)**    | The skill instruction file (same SKILL.md format as the Action)                                                                                        |
| `PF`       | **src/sdk/prepare.ts**        | Prepares the diff into analysis-ready `PreparedFile[]` (shared with the Action)                                                                        |
| `AN`       | **src/sdk/analyze.ts**        | Core analysis engine — same one the Action uses                                                                                                        |
| `AI`       | **Anthropic Claude API**      | The external AI service — identical calls as in the GitHub Action                                                                                      |
| `TR`       | **src/cli/terminal.ts**       | Terminal output renderer — delegates to React/Ink for colored terminal output                                                                          |
| `UI`       | **Ink / React (Terminal UI)** | The React-based terminal UI library that renders findings with colors, badges, and interactive prompts                                                 |
| `FX`       | **src/cli/fix.ts**            | Handles the `--fix` mode — calls Claude to generate a patch and writes it to disk                                                                      |
| `DA`       | **src/cli/diff-apply.ts**     | Applies a unified diff patch to a file — hunk-aware patch application                                                                                  |

---

## Command Line Syntax

```bash
# Basic scan
warden scan src/foo.ts

# Scan with a specific skill
warden scan src/foo.ts --skill find-warden-bugs

# Scan and interactively apply fixes
warden scan src/foo.ts --fix

# Output raw JSON (for tooling / scripts)
warden scan src/foo.ts --json

# Log analysis details to a file
warden scan src/foo.ts --log
```

---

## Step-by-Step Walkthrough

### Steps 1–4: Startup & Config

| Step                    | What Happens                                                     | Why                                                                          |
| ----------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `U → CM`                | Developer types `warden scan src/foo.ts [--fix] [--skill name]`  | The `warden` binary is in PATH (installed globally or via npx)               |
| `CM → AR: parseArgs()`  | Parse command-line flags                                         | Extracts file paths, skill filter, `--fix` flag, `--json` flag, `--log` flag |
| `AR → CM`               | Returns `ParsedArgs`                                             | Strongly typed parsed arguments                                              |
| `CM → CF: loadConfig()` | Read `warden.toml` from the current directory or `--config` path | Same config loader as the GitHub Action — skills, defaults, paths            |
| `CF → CM`               | Returns `WardenConfig`                                           |                                                                              |

---

### Steps 5–10: Build Local Context

**This is what makes CLI mode different from the Action — there's no GitHub API. The diff comes from `git diff` instead.**

| Step                                              | What Happens                                           | Why                                                                                |
| ------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `CM → IN: buildLocalContext()`                    | Build the event context for local mode                 | Need an `EventContext` with `eventType = "local"`                                  |
| `IN → GT: getChangedFilesWithPatches(baseBranch)` | Run `git diff` to get changes                          | Computes what changed relative to the default branch (or user-specified `--base`). |
| `GT → GT`                                         | Executes `git diff`                                    | Returns raw unified diff string                                                    |
| `GT → IN`                                         | Returns raw diff string                                |                                                                                    |
| `IN → IN: toFileChange(gitFiles)`                 | Convert git file changes to `FileChange[]`             | Same format as used in the GitHub Action to normalize the diff                     |
| `IN → CM`                                         | Returns `EventContext { eventType:"local", repoPath }` | Context is ready. Note: `pullRequest` is synthetic (no real PR in local mode)      |

---

### Steps 11–19: Skill Loading and Diff Preparation

| Step                             | What Happens                             | Why                                                                                                      |
| -------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `CM → CS: runScan()`             | Run the scan                             | Main.ts orchestrates scan directly — loads skills, prepares files, runs analysis                         |
| `CS → SK: resolveSkillAsync()`   | Load SKILL.md for the requested skill(s) | If `--skill` was passed, load only that skill. Otherwise, load all skills with `type = "local"` triggers |
| `SK → CS`                        | Returns `SkillDefinition[]`              | Loaded prompt text, tool list, description                                                               |
| `CS → PF: prepareFiles()`        | Prepare the diff for analysis            | Identical pipeline to the GitHub Action                                                                  |
| `PF → PF: parsePatches()`        | Extract hunks from diff                  |                                                                                                          |
| `PF → PF: coalesceNearbyHunks()` | Merge close hunks                        |                                                                                                          |
| `PF → PF: expandContext()`       | Add surrounding code lines               |                                                                                                          |
| `PF → PF: groupHunksByFile()`    | Group by file                            |                                                                                                          |
| `PF → CS`                        | Returns `PreparedFile[]`                 | Ready for analysis                                                                                       |

---

### Steps 20–30: Analysis (Identical to GitHub Action)

| Step                              | What Happens                   | Why                                                                      |
| --------------------------------- | ------------------------------ | ------------------------------------------------------------------------ |
| `CS → AN: runSkill()`             | Run the analysis               | Same `runSkill()` function used by the Action                            |
| (loop per PreparedFile) `AN → AN` | Build system prompt            | `buildHunkSystemPrompt(skill)` — role + skill instructions + JSON format |
| `AN → AN`                         | Build user prompt              | `buildHunkUserPrompt(hunk, context)` — diff + context lines              |
| `AN → AI: query()`                | Call Claude                    | Identical API call to the Action (API key from env or `warden.toml`)     |
| `AI → AN`                         | Returns message content        |                                                                          |
| `AN → AN: extractFindingsJson()`  | Parse findings from response   |                                                                          |
| `AN → AN: filterOutOfRange()`     | Drop hallucinated line numbers |                                                                          |
| `AN → CS`                         | Returns `HunkAnalysisResult`   |                                                                          |
| `CS → CS: aggregateResults()`     | Combine all hunk results       | Merges all `HunkAnalysisResult` objects into one `SkillReport`           |
| `CS → CM`                         | Returns `SkillReport`          |                                                                          |

---

### Steps 31–36: Output Rendering

Two output paths based on flags:

#### If `--json` flag is set:

| Step     | What Happens                              |
| -------- | ----------------------------------------- | -------------------------------------------------------- |
| `CM → U` | Print `SkillReport` as raw JSON to stdout | Useful for piping to other tools, logging, or CI scripts |

#### Default (terminal output):

| Step                              | What Happens                     |
| --------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------- |
| `CM → TR: renderTerminal(report)` | Pass report to terminal renderer |
| `TR → UI`                         | Create React/Ink component tree  | Ink renders React components directly to the terminal                               |
| `UI → U`                          | Colored terminal output          | Shows findings with severity badges (red/yellow/blue), code locations, descriptions |

---

### Steps 37–47: Interactive Fix Mode (`--fix`)

**This entire section only runs if `--fix` was passed and there are findings.**

| Step                                              | What Happens                            | Why                                                                        |
| ------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------- |
| `CM → UI`                                         | Render interactive checkbox list        | Ink renders a terminal checklist of all findings                           |
| `U → UI`                                          | Developer selects which findings to fix | Uses keyboard navigation (arrow keys + space)                              |
| `UI → CM`                                         | Returns `selectedFindings[]`            | List of findings the developer wants to apply fixes for                    |
| (loop per selected finding) `CM → FX: applyFix()` | Fix this finding                        |                                                                            |
| `FX → AN: generateFix()`                          | Ask Claude to generate a code fix       | Claude is given the finding details + the current file content             |
| `AN → AI: query()`                                | Claude generates a patch                | This time tools may include `Write`/`Edit` for fix generation mode         |
| `AI → AN`                                         | Returns unified diff patch              |                                                                            |
| `AN → FX`                                         | Returns patch string                    |                                                                            |
| `FX → DA: applyDiff()`                            | Apply the patch to the file             | Hunk-aware patch application — handles line number offsets correctly       |
| `DA → DA`                                         | Applies each hunk in the patch          | Validates line numbers, handles context lines, writes the modified content |
| `DA → FX`                                         | Returns patched file content            |                                                                            |
| `FX → U`                                          | Write file to disk                      | Overwrites the original file with the fix applied                          |
| `CM → U`                                          | "Applied N fixes" message               | Summary of what was changed                                                |

---

### Step 48: Exit

| Step     | What Happens           |
| -------- | ---------------------- | ----------------------------------------------------------------------------------- |
| `CM → U` | `process.exit(0 or 1)` | Exit code is based on whether any findings at or above `failOn` severity were found |

> In local mode, failing with exit code 1 is often used in git pre-commit hooks to block commits with high-severity findings.

---

## Differences Between CLI and GitHub Action

| Aspect             | GitHub Action                         | CLI Local                                                             |
| ------------------ | ------------------------------------- | --------------------------------------------------------------------- |
| **Trigger**        | `pull_request` GitHub event           | Manual `warden scan` command                                          |
| **Diff source**    | GitHub API (`/pulls/:number/files`)   | `git diff HEAD~1 -- <file>`                                           |
| **Event context**  | `eventType = "pull_request"`          | `eventType = "local"`                                                 |
| **Output**         | GitHub PR Reviews + Check Runs        | Terminal (Ink/React) or JSON stdout                                   |
| **Fix mode**       | Not available                         | `--fix` flag — interactive terminal UI                                |
| **Concurrency**    | Semaphore (from config)               | Semaphore (from config)                                               |
| **Skills loaded**  | Triggers with `type = "pull_request"` | Triggers with `type = "local"` (or `--skill` to run a specific skill) |
| **Deduplication**  | Yes — across trigger results          | No — single skill run                                                 |
| **Fix evaluation** | Yes — compares with previous run      | No                                                                    |

---

## Flow at a Glance

```
Developer: warden scan src/foo.ts --fix
  └── cli/main.ts
        ├── args.ts → ParsedArgs
        ├── config/loader.ts → WardenConfig
        ├── cli/context.ts → git diff → EventContext (local)
        └── cli/main.ts (scan orchestration)
              ├── Load SKILL.md
              ├── sdk/prepare.ts → PreparedFile[]
              ├── sdk/analyze.ts → Claude API (per hunk)
              │     └── sdk/prompt.ts (prompts)
              ├── SkillReport
              └── Output
                    ├── --json → stdout
                    └── default → Ink terminal UI
                          └── --fix → interactive selection
                                └── cli/fix.ts → Claude → cli/diff-apply.ts → file written
```
