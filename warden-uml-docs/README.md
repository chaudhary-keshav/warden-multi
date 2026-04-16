# @sentry/warden — UML Diagram Reference Docs

## How to Use

Open **`warden-uml-diagrams.html`** in a browser alongside one of the documents below.
Each document explains every named element in its corresponding diagram — types, actors, modules, fields, and arrows.

---

## Documents in This Folder

| #   | File                                                               | Diagram                                                           |
| --- | ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| 1   | [01-core-domain-types.md](01-core-domain-types.md)                 | Class diagram — all domain types from `src/types/index.ts`        |
| 2   | [02-config-sdk-types.md](02-config-sdk-types.md)                   | Class diagram — config schemas and SDK runtime types              |
| 3   | [03-auto-pr-review-sequence.md](03-auto-pr-review-sequence.md)     | Sequence diagram — automated GitHub Action PR review (end-to-end) |
| 4   | [04-cli-local-review-sequence.md](04-cli-local-review-sequence.md) | Sequence diagram — `warden scan` CLI local review                 |
| 5   | [05-warden-sweep-batch-flow.md](05-warden-sweep-batch-flow.md)     | Sequence diagram — manual full-repo batch sweep                   |
| 6   | [06-module-dependency-graph.md](06-module-dependency-graph.md)     | Dependency graph — all ~40 modules, layers, and data flow         |

---

## Architecture in One Sentence

Warden is a **generic AI-powered code review platform** (by Sentry).
It runs **skills** (SKILL.md files) against code diffs, calls Claude for each code chunk, and posts findings as GitHub PR comments and Checks.
There are **two separate systems**:

- **Automatic** — triggered by a GitHub `pull_request` event via a GitHub Action workflow.
- **Manual (warden-sweep)** — an on-demand full-repo batch scan invoked by an engineer.

---

## Quick Glossary

| Term             | Plain English                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Skill**        | A `SKILL.md` file that tells Claude _what to look for_ in a code review. It contains instructions, patterns, and examples. |
| **Hunk**         | A contiguous block of changed lines inside a diff (one file can have many hunks).                                          |
| **Finding**      | A single issue Claude detected — has a severity, confidence, location, and description.                                    |
| **SkillReport**  | The complete analysis result from running one skill — contains all findings, token usage, and duration.                    |
| **Trigger**      | A binding between a skill and an event type (e.g. run _find-warden-bugs_ on every `pull_request`).                         |
| **warden-sweep** | The batch tool that scans every file in the repo at once and creates one PR per finding.                                   |
| **PreparedFile** | A file's diff after parsing, splitting, coalescing, and adding context lines — ready to send to Claude.                    |
| **RunPool**      | A concurrency helper that runs N tasks in parallel with a semaphore cap.                                                   |
