# Diagram 5 — Warden-Sweep Manual Batch Scan Flow Reference

**Corresponding diagram:** Diagram 5 in `warden-uml-diagrams.html`
**Trigger:** An engineer manually invokes the `warden-sweep` skill — no GitHub event involved.

The warden-sweep is a **full-repo batch scanner**. Instead of reviewing one PR, it:

1. Scans _every file_ in the repository
2. Verifies each finding with a dedicated AI subagent
3. Creates a GitHub issue tracking all confirmed findings
4. Patches each finding in an isolated git worktree
5. Opens one PR per fix

---

## Actors (Diagram Participants)

| Short Code | Full Name                          | What It Is                                                                                                                                                                                         |
| ---------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EN`       | **Engineer**                       | The human who kicks off the sweep — typically done quarterly or before a major release                                                                                                             |
| `CL`       | **Claude (Orchestrator)**          | The AI acting as overall orchestrator, following the instructions in `SKILL.md`                                                                                                                    |
| `SM`       | **SKILL.md (Orchestration Guide)** | The `skills/warden-sweep/SKILL.md` file — contains all 5-phase instructions. Has `disable-model-invocation: true` (meaning Claude reads instructions but doesn't call Claude itself at this level) |
| `SC`       | **scripts/scan.py**                | Phase 1 Python script — enumerates files, runs `warden` on each in parallel threads                                                                                                                |
| `WA`       | **warden CLI (per file)**          | The `warden scan` CLI called for each individual file during the scan phase                                                                                                                        |
| `EX`       | **scripts/extract_findings.py**    | Normalizes and deduplicates findings from all per-file logs into one master JSONL file                                                                                                             |
| `VA`       | **Verify Subagent (×8 parallel)**  | AI subagents (up to 8 running at once) that each verify one finding against the actual source code                                                                                                 |
| `IP`       | **scripts/index_prs.py**           | Fetches existing open/closed PRs from GitHub and semantically deduplicates against current findings                                                                                                |
| `CI`       | **scripts/create_issue.py**        | Creates a single GitHub issue that lists all verified findings as a tracking table                                                                                                                 |
| `GH`       | **GitHub Issues API**              | The GitHub API endpoint for creating the tracking issue                                                                                                                                            |
| `PA`       | **Patch Subagent (sequential)**    | AI subagents that apply a code fix for each finding. Run sequentially (not parallel) to avoid git conflicts.                                                                                       |
| `WT`       | **git worktree (isolated)**        | An isolated git working directory for each fix — prevents one patch from affecting others                                                                                                          |
| `OP`       | **scripts/organize.py**            | Creates GitHub PRs for each patch and cross-links them to the tracking issue                                                                                                                       |
| `PR`       | **GitHub Pull Requests API**       | The GitHub API endpoint for creating fix PRs                                                                                                                                                       |

---

## Phase 1 — Scan (Parallel File Analysis)

**Goal:** Run Warden on every file in the repo and collect all raw findings.

| Step                          | What Happens                                               | Why                                                                             |
| ----------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `EN → CL`                     | Engineer invokes warden-sweep                              | Typically done via Claude interface: "run warden-sweep on this repo"            |
| `CL → SM`                     | Read SKILL.md                                              | The orchestration guide tells Claude how to run all 5 phases                    |
| `SM → CL`                     | Returns 5-phase instructions                               | `disable-model-invocation: true` means this skill is a guide, not a prompt      |
| `CL → SC`                     | Run `scan.py --repo . --output data/`                      | Kick off the parallel file scanner                                              |
| `SC → SC: git ls-files`       | List all tracked files                                     | Gets every file in the repo under source control                                |
| `SC → SC`                     | Filter by extension                                        | Only analyze `.ts`, `.js`, `.py`, `.go`, etc. — skips binaries, lockfiles, etc. |
| `SC → SC`                     | Read ignorePaths from warden.toml                          | Respects the repo's existing ignore configuration (e.g. `dist/**`, `evals/**`)  |
| `SC → SC: ThreadPoolExecutor` | Launch N parallel threads                                  | Python's thread pool — each thread handles one file                             |
| (parallel loop) `SC → WA`     | `warden scan <file> --json --skill find-warden-bugs`       | Calls the Warden CLI for one file                                               |
| `WA → WA`                     | Load skill, prepare hunks, call Claude                     | Full analysis pipeline — identical to CLI local mode                            |
| `WA → SC`                     | Returns findings JSONL                                     | Per-file log written to `data/logs/<filename>.jsonl`                            |
| `SC → EX`                     | Run `extract_findings.py data/logs/`                       | Normalize all per-file logs                                                     |
| `EX → EX`                     | Normalize findings                                         | Standardize field names, severity values, etc.                                  |
| `EX → EX: assign IDs`         | `sha256(title + path + line)[:8]` prefixed with skill name | Stable ID for deduplication across runs                                         |
| `EX → EX: deduplicate`        | Remove exact duplicate IDs                                 | Same finding found in overlapping hunks                                         |
| `EX → SC`                     | Returns `data/all-findings.jsonl`                          | Master list of all raw findings                                                 |
| `SC → CL`                     | Scan complete (N findings across M files)                  | Phase 1 done — Claude now has a full finding list                               |

---

## Phase 2 — Verify (8 Parallel AI Subagents)

**Goal:** Each finding gets a dedicated AI subagent that reads the actual source code and determines if the finding is real or a false positive.

**Why verify separately?** The scan phase runs Warden skill-by-skill against isolated file chunks. The verify phase gives each finding a focused pass with more context — looking at callers, callees, and upstream mitigations.

| Step                                | What Happens                                                                | Why                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `CL → CL`                           | Read `all-findings.jsonl`, batch into groups of 8                           | Process up to 8 findings at a time                                    |
| (parallel, 8 at once) `CL → VA`     | Spawn verify subagent with finding + `verify-prompt.md`                     | Each subagent gets one finding to investigate                         |
| `VA → VA: Read file`                | Read the source file (±50 lines around the finding)                         | Needs full context, not just the diff                                 |
| `VA → VA: Grep for callers/callees` | Search for all code that calls or is called by the flagged function         | Checks if a caller already handles the error/edge case                |
| `VA → VA: trace data flow upstream` | Follow data back to where it enters the system                              | Checks if input is already validated before reaching the flagged code |
| `VA → VA: check mitigations`        | Look for try/catch, null checks, type guards near the finding               | If the concern is already handled, the finding is a false positive    |
| `VA → CL`                           | Returns verdict `{ findingId, verdict, confidence, reasoning, traceNotes }` | Subagent's decision                                                   |
| `CL → CL`                           | Filter `verdict == "rejected"` findings                                     | Remove false positives                                                |
| `CL → CL`                           | Write `data/verified-findings.jsonl`                                        | Only confirmed, real bugs remain                                      |
| `CL → EN`                           | Verification complete (K findings confirmed)                                | Engineer sees how many real issues were found                         |

#### Verify Subagent Verdict Fields

| Field        | Type                         | Meaning                                                                         |
| ------------ | ---------------------------- | ------------------------------------------------------------------------------- |
| `findingId`  | `string`                     | Which finding this verdict is for                                               |
| `verdict`    | `"verified"` or `"rejected"` | Real bug vs false positive                                                      |
| `confidence` | `high / medium / low`        | How certain the subagent is                                                     |
| `reasoning`  | `string`                     | Why the subagent reached this verdict                                           |
| `traceNotes` | `string`                     | Notes from data flow tracing (e.g. "input already validated in `parseInput()`") |

---

## Phase 3 — Dedup and Issue Creation

**Goal:** Check for existing PRs covering these findings (avoid duplicate work), then create a GitHub issue as a tracking document.

| Step                       | What Happens                                           | Why                                                                                                   |
| -------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | --- | -------- | ----- | ---- | ---- | --- |
| `CL → IP`                  | Run `index_prs.py --repo owner/repo`                   | Fetch existing PRs to avoid creating duplicate fix PRs                                                |
| `IP → PR`                  | `GET /repos/:owner/:repo/pulls` (open + closed)        | Fetch all PRs — both open and already-merged                                                          |
| `PR → IP`                  | Returns PR list with titles and bodies                 |                                                                                                       |
| `IP → IP: semantic dedup`  | Run Haiku model to compare finding titles vs PR titles | Semantic similarity check — "SQL injection in login form" ≈ "Fix SQL injection vulnerability in auth" |
| `IP → IP: cross-reference` | Mark findings that already have a PR                   |                                                                                                       |
| `IP → CL`                  | Returns `data/pr-index.json`                           | Map of finding ID → existing PR URL (if any)                                                          |
| `CL → CI`                  | Run `create_issue.py verified-findings.jsonl`          | Create the tracking issue                                                                             |
| `CI → CI`                  | Group findings by module/severity                      | Organizes the issue body into a readable table                                                        |
| `CI → CI`                  | Format issue body                                      | Markdown table: `                                                                                     | ID  | Severity | Title | File | Line | `   |
| `CI → GH`                  | `POST /repos/:owner/:repo/issues`                      | Create the GitHub issue                                                                               |
| `GH → CI`                  | Returns issue URL                                      |                                                                                                       |
| `CI → CL`                  | GitHub issue created                                   | Engineer has a link to the tracking issue                                                             |

---

## Phase 4 — Patch (Sequential, Isolated Git Worktrees)

**Goal:** Apply a code fix for each verified finding. Run sequentially to avoid git conflicts.

**Why sequentially?** Parallel patches would conflict on the same git repository. Each patch needs a clean base to diff against.

**Why git worktrees?** A worktree creates a second checkout of the repo at a different path, on a new branch — completely isolated from the main working directory. The patch subagent works only in the worktree, commits, then it's removed.

| Step                                           | What Happens                                                                 | Why                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| (loop, one at a time) `CL → PA`                | Spawn patch subagent with finding + `patch-prompt.md`                        | One subagent per finding, sequential                            |
| `PA → WT: git worktree add /tmp/fix-<id> main` | Create isolated working directory on a new branch                            | Isolates this fix from all others                               |
| `PA → WT: cd /tmp/fix-<id>`                    | Enter the worktree                                                           |                                                                 |
| `PA → PA: read target file`                    | Read the full source file                                                    | Understand the complete code, not just the diff                 |
| `PA → PA: grep callers/callees`                | Find all code that interacts with the buggy function                         | Impact analysis — don't break callers                           |
| `PA → PA: apply minimal fix`                   | Write the code fix                                                           | STRICT RULE: only change the target file. No unrelated changes. |
| `PA → PA: write regression test`               | Add or update `foo.test.ts` alongside the fix                                | Every fix must have a test that would have caught the bug       |
| `PA → PA: git diff (self-review)`              | Review the full diff before committing                                       | Catches accidental changes, confirms fix is correct             |
| `PA → WT: git commit`                          | `"fix: <title> [warden]"`                                                    | Commit message includes the finding title and `[warden]` tag    |
| `PA → CL`                                      | Returns `PatchResult { status, filesChanged, testFilesChanged, selfReview }` | Summary of what was changed                                     |
| `CL → WT: git worktree remove /tmp/fix-<id>`   | Clean up the worktree                                                        |                                                                 |

#### PatchResult Fields

| Field              | Type                       | Meaning                                                          |
| ------------------ | -------------------------- | ---------------------------------------------------------------- |
| `status`           | `"applied"` or `"skipped"` | Was the fix applied, or was it skipped (e.g. too complex, risky) |
| `filesChanged`     | `string[]`                 | Source files modified                                            |
| `testFilesChanged` | `string[]`                 | Test files added/modified                                        |
| `selfReview`       | `string`                   | The git diff output that the subagent reviewed before committing |
| `skipReason`       | `string`                   | (Optional) Why the fix was skipped                               |

---

## Phase 5 — Organize (PRs and Cross-References)

**Goal:** Open one GitHub PR per patched finding and link all PRs back to the tracking issue.

| Step                       | What Happens                                              | Why                                                            |
| -------------------------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| `CL → OP`                  | Run `organize.py data/ --repo owner/repo`                 | Create all PRs                                                 |
| (loop per patch) `OP → PR` | `POST /repos/:owner/:repo/pulls`                          | Create a PR from the fix branch (worktree branch) to `main`    |
| `PR → OP`                  | Returns PR URL and number                                 |                                                                |
| `OP → OP`                  | Record PR in `pr-index.json`                              | Update index for deduplication in future sweeps                |
| `OP → GH`                  | `PATCH /repos/:owner/:repo/issues/:id`                    | Update the tracking issue body to include links to all fix PRs |
| `OP → CL`                  | Organize complete                                         |                                                                |
| `CL → EN`                  | "Sweep complete. N findings → K verified → J PRs created" | Final summary to the engineer                                  |

---

## Key Constraints

### Why can't the patch subagent modify other files?

The `patch-prompt.md` explicitly instructs: **"Do NOT modify files outside the fix target and its test file."** This prevents cascading changes that are hard to review and might introduce new bugs.

### Why is there no automatic cross-finding coordination?

This is a known architectural gap. If finding A is in `utils/parse.ts` and finding B is in `cli/input.ts`, and fixing A would affect B — there is no automated mechanism to coordinate. The human reviewing the PRs must notice the dependency and merge them in the right order.

### What does `index_prs.py` actually prevent?

It prevents re-creating a PR for a bug that was already fixed (or is already being fixed) in an open PR. The semantic similarity check uses Claude Haiku (cheaper/faster model) to compare finding titles with existing PR titles — "close enough" is treated as already-covered.

---

## Sweep Flow at a Glance

```
Engineer: invoke warden-sweep
  └── Claude (orchestrator) reads SKILL.md

  Phase 1 — Scan (parallel)
    scan.py → ThreadPoolExecutor
      └── [thread per file] warden CLI → Claude → findings JSONL
    extract_findings.py → data/all-findings.jsonl

  Phase 2 — Verify (8 parallel AI subagents)
    [subagent per finding] read file → trace callers → verdict
    → data/verified-findings.jsonl (false positives removed)

  Phase 3 — Dedup + Issue
    index_prs.py → semantic dedup against GitHub PRs
    create_issue.py → GitHub Issue (tracking table)

  Phase 4 — Patch (sequential, isolated)
    [one patch subagent per finding]
      git worktree → read → fix → test → commit → remove worktree

  Phase 5 — Organize
    organize.py → GitHub PR per fix → update tracking issue
```

---

## Comparison: Sweep vs Auto PR Review

| Aspect           | Auto PR Review (Diagram 3)        | Warden-Sweep (Diagram 5)                          |
| ---------------- | --------------------------------- | ------------------------------------------------- |
| **Trigger**      | GitHub `pull_request` event       | Manual engineer invocation                        |
| **Scope**        | One PR's diff                     | Entire repository                                 |
| **Output**       | PR review comments + Check status | Multiple fix PRs + tracking issue                 |
| **Fix mode**     | None                              | Automated patch subagents                         |
| **Verification** | filterOutOfRangeFindings only     | Dedicated verify subagents (read full code)       |
| **Concurrency**  | Parallel triggers (Semaphore)     | Parallel scan + parallel verify; sequential patch |
| **Frequency**    | Every PR push                     | On-demand (quarterly, pre-release)                |
| **Duration**     | Seconds to minutes                | Minutes to hours (depends on repo size)           |
