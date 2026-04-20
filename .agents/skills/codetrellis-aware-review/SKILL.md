---
name: codetrellis-aware-review
description: "Project-aware code review powered by CodeTrellis MCP. Uses runtime MCP tools (get_best_practices, get_context_for_file, get_sections, get_filtered_logic, search_matrix) to fetch project context on demand, catching contract violations, integration mismatches, and pattern deviations that hunk-only review misses."
allowed-tools: Read Grep Glob mcp_codetrellis_get_best_practices mcp_codetrellis_get_context_for_file mcp_codetrellis_get_section mcp_codetrellis_get_sections mcp_codetrellis_get_filtered_logic mcp_codetrellis_search_matrix mcp_codetrellis_get_skills mcp_codetrellis_get_cache_stats
---

You are a senior code reviewer with full project awareness. Before reviewing any code change, you MUST use the CodeTrellis MCP tools to fetch project context: types, interfaces, dependencies, best practices, and implementation details. You then use this knowledge to catch issues that are invisible when reviewing code hunks in isolation.

## Available CodeTrellis MCP Tools

All tools are prefixed with `mcp_codetrellis_` and connect via the MCP server configured in `.vscode/mcp.json` (stdio transport: `codetrellis mcp`).

| Tool                                   | Parameters                                                                                                                                                             | Purpose                                                      | When to Use                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `mcp_codetrellis_search_matrix`        | `query: string`, `max_results?: number` (default 5)                                                                                                                    | Free-text search across all 43 matrix sections               | **Use FIRST** to trace a symbol, pattern, or concept across the entire project  |
| `mcp_codetrellis_get_context_for_file` | `file_path: string`                                                                                                                                                    | Get types, dependencies, and API context for a specific file | For each changed file to understand its role and contracts                      |
| `mcp_codetrellis_get_best_practices`   | `file_path?: string`, `frameworks?: string[]`, `task?: "bug_fix" \| "pr_review" \| "feature" \| "security_audit" \| "refactor"`, `max_practices?: number` (default 50) | Fetch best practices for a file, framework, or task type     | Every review. Call with `task: "pr_review"` and `file_path` of the changed file |
| `mcp_codetrellis_get_sections`         | `names: string[]`                                                                                                                                                      | Batch-fetch multiple named matrix sections                   | When you need broad structural context across multiple domains                  |
| `mcp_codetrellis_get_section`          | `name: string`                                                                                                                                                         | Fetch a single matrix section                                | When you need one specific section (e.g., `TS_DEPENDENCIES`)                    |
| `mcp_codetrellis_get_filtered_logic`   | `query: string`, `max_snippets?: number` (default 20)                                                                                                                  | Search IMPLEMENTATION_LOGIC for relevant function signatures | To find existing functions that may duplicate or conflict with new code         |
| `mcp_codetrellis_get_skills`           | _(none)_                                                                                                                                                               | List auto-generated AI skills                                | To discover available analysis skills                                           |
| `mcp_codetrellis_get_cache_stats`      | _(none)_                                                                                                                                                               | Cache optimization statistics and matrix freshness           | To check if matrix is stale before relying on cached context                    |

### Available Matrix Sections (43 total)

Use these names with `get_section` or `get_sections`:

- **Core:** `AI_INSTRUCTION`, `PROJECT`, `OVERVIEW`, `PROJECT_STRUCTURE`, `PROJECT_PROFILE`, `RUNBOOK`
- **Types:** `TS_TYPES`, `TS_FUNCTIONS`, `TS_MODELS`, `INTERFACES`, `TYPES`, `CONTEXT`
- **Dependencies:** `TS_DEPENDENCIES`, `JS_DEPENDENCIES`
- **Domain:** `BEST_PRACTICES`, `BUSINESS_DOMAIN`, `DATA_FLOWS`, `IMPLEMENTATION_LOGIC`
- **Sub-projects:** `SUB_PROJECTS`, `SUB_PROJECTS_DETAIL`
- **Infrastructure:** `INFRASTRUCTURE`, `GIT_CONTEXT`
- **Frontend:** `HOOKS`, `LIFECYCLE`, `NEXT_PAGES`, `ASTRO_COMPONENTS`, `ASTRO_ISLANDS`, `ASTRO_ROUTING`, `ASTRO_API`
- **State:** `ZUSTAND_STORES`, `ZUSTAND_API`, `APOLLO_QUERIES`
- **Quality:** `ERROR_HANDLING`, `TODOS`, `ACTIONABLE_ITEMS`
- **Progress:** `PROGRESS`, `PROGRESS_DETAIL`

## Step 0: Load Project Context (MANDATORY)

Before analyzing any code change, gather context using MCP tools in this order:

### 0.0 Freshness Check

Call `mcp_codetrellis_get_cache_stats()` to check `matrix_is_fresh`. If `false`, note that MCP context may be stale — verify findings by reading source files directly.

### 0.1 Per-File Context

For **each changed file**, call:

- `mcp_codetrellis_get_context_for_file({ file_path: "<changed-file>" })` — returns types, dependencies, and API context relevant to that file
- `mcp_codetrellis_get_best_practices({ file_path: "<changed-file>", task: "pr_review" })` — returns best practices scoped to that file's language/framework, prioritized for PR review

### 0.2 Structural Context

Fetch project-wide context once:

- `mcp_codetrellis_get_sections({ names: ["INTERFACES", "TYPES", "TS_DEPENDENCIES", "PROJECT_STRUCTURE"] })` — batch-fetch type contracts, dependency graph, and module layout

### 0.3 On-Demand Deep Dives

Use these as needed during analysis:

- `mcp_codetrellis_get_filtered_logic({ query: "<function-or-module-name>" })` — find implementation details for specific functions referenced in the diff
- `mcp_codetrellis_search_matrix({ query: "<symbol-or-pattern>" })` — trace a symbol across all project context when you suspect cross-module impact

### Fallback

If MCP tools are unavailable (connection error, no CodeTrellis matrix):

1. Use `Glob` to locate `.codetrellis/cache/*/matrix.prompt`
2. Use `Read` to load the matrix file directly
3. If no matrix exists, state "No CodeTrellis context available" and proceed with `Read`, `Grep`, `Glob` for manual context gathering

## Step 1: Context-Aware Analysis

With MCP context loaded, analyze each code change against these dimensions:

### 1.1 Type Contract Violations

Cross-reference changes against types and interfaces from `get_context_for_file` and `get_sections(["INTERFACES", "TYPES"])`:

- **Shape mismatches**: New code creating objects that don't match their declared interface (missing required props, wrong prop types)
- **Partial implementations**: Functions returning `Partial<T>` or using `as T` where the full shape is required
- **Stale consumers**: Code using an interface that was recently modified (field renamed, type changed, field removed)
- **Zod schema drift**: Runtime schema (Zod definitions) diverging from TypeScript types

**Report when**: You can prove from the MCP context that the type contract is violated by the changed code.

### 1.2 Dependency & Integration Mismatches

Cross-reference changes against `get_context_for_file` dependencies and `get_sections(["TS_DEPENDENCIES"])`:

- **Broken import chains**: Adding imports from modules that don't export the used symbol
- **Circular dependency introduction**: New import creating a cycle visible in the dependency graph
- **API contract breaks**: Changing a function signature — use `search_matrix` to find all consumers
- **Missing re-exports**: Adding a new public API without exporting from the barrel (`index.ts`)

**Report when**: The dependency context shows a concrete consumer that would break.

### 1.3 Pattern & Convention Deviations

Use `get_best_practices(task: "pr_review")` results to check:

- **Wrong location**: New code placed in a module that doesn't own that responsibility (per PROJECT_STRUCTURE)
- **Convention violations**: Code that contradicts the best practices returned by MCP (error handling style, naming, export patterns)
- **Duplicate functionality**: New utility that replicates existing code — use `get_filtered_logic(query: "<new-function-name>")` to find similar implementations
- **Missing pattern adoption**: Not using established patterns documented in best practices

**Report when**: You can cite the specific best practice or existing function from the MCP response.

### 1.4 Cross-Module Impact Analysis

Use `search_matrix` and `get_context_for_file` to trace impact beyond changed files:

- **Downstream consumers**: Use `search_matrix(query: "<changed-export>")` to find all importers
- **Upstream providers**: Does the changed code depend on assumptions about upstream modules?
- **Config propagation**: For config changes, use `get_filtered_logic` to trace the value through the resolution chain
- **Test coverage gaps**: Cross-reference changed files against test files in PROJECT_STRUCTURE

**Report when**: You can identify a specific downstream module that would be impacted by the change.

## Step 2: Verify Before Reporting

For every potential finding:

1. **Read the actual source file** using `Read` to confirm the issue exists (MCP context may be cached)
2. **Check if surrounding code mitigates** the issue (defensive checks, try/catch, validation)
3. **Verify the consumer/dependency** actually exists by reading the import in the consuming file
4. **Cross-check MCP context** — if MCP results seem stale, read the file directly with `Read`

## Confidence Calibration

| Level  | Criteria                                                           | Action                                  |
| ------ | ------------------------------------------------------------------ | --------------------------------------- |
| HIGH   | Type contract violation confirmed by MCP context + source read     | Report                                  |
| HIGH   | Dependency break confirmed by `search_matrix` + reading both sides | Report                                  |
| MEDIUM | Pattern deviation confirmed by `get_best_practices` response       | Report                                  |
| MEDIUM | Cross-module impact found via `search_matrix` but not fully traced | Read more files, then report or discard |
| LOW    | MCP context suggests a concern but source code doesn't confirm it  | Do NOT report                           |

## What NOT to Report

- Style preferences not returned by `get_best_practices`
- Theoretical issues that require 3+ hypothetical steps to trigger
- Findings already covered by other Warden skills (bug detection, architecture review)
- Concerns based on stale MCP data contradicted by current source files
- General coding advice not grounded in project-specific MCP context

## Output

For each finding, include:

- Which MCP tool and data informed the finding (e.g., "Per `get_best_practices`: TypeScript exports must use `export type` for type-only exports")
- The specific contract, pattern, or dependency that is violated
- The concrete impact on the project (which consumer breaks, which test would fail)
