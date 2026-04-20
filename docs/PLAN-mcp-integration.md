# Plan: CodeTrellis MCP Integration into Warden

## Problem

Warden skills review PR code hunks in isolation. Each skill gets only the diff + 20 lines of surrounding context. Skills like `codetrellis-aware-review` need full project awareness (types, interfaces, dependencies, best practices) which CodeTrellis MCP provides at runtime. But Warden's pipeline has no MCP support today.

## Current Pipeline

```
PR Event → pr-workflow.ts → executor.ts → analyzeHunk()
  → buildHunkSystemPrompt(skill)        ← skill.prompt embedded
  → buildHunkUserPrompt(diff, context)
  → executeQuery()
    ├─ Claude: claudeQuery({ allowedTools: ["Read","Grep","Glob"] })
    ├─ OpenAI: client.chat.completions.create({ tools: TOOL_DEFINITIONS_OPENAI })
    └─ Gemini: client.models.generateContent({ tools: TOOL_DECLARATIONS_GEMINI })
```

Tools are hard-coded. Zero MCP references in `src/`.

## SDK MCP Support (Already Available)

| Provider | SDK                              | MCP Native? | Config Format                                                                                 |
| -------- | -------------------------------- | ----------- | --------------------------------------------------------------------------------------------- |
| Claude   | `@anthropic-ai/claude-agent-sdk` | Yes         | `mcpServers: Record<string, McpServerConfig>` — stdio, SSE, HTTP, in-process SDK              |
| OpenAI   | `openai` chat completions        | No          | N/A (chat completions API has no MCP)                                                         |
| OpenAI   | `openai` responses API           | Yes         | `tools: [{ type: "mcp", server_url, server_label }]` — HTTP only, OpenAI connects server-side |
| Gemini   | `@google/genai`                  | No          | N/A                                                                                           |

### Claude SDK MCP Types (from `sdk.d.ts`)

```typescript
mcpServers?: Record<string, McpServerConfig>;

type McpServerConfig =
  | McpStdioServerConfig    // { command, args?, env? }
  | McpSSEServerConfig      // { type: "sse", url, headers? }
  | McpHttpServerConfig     // { type: "http", url, headers? }
  | McpSdkServerConfigWithInstance;  // in-process SDK server

type McpStdioServerConfig = {
  type?: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
};
```

### OpenAI Responses API MCP Type

```typescript
// tools array item:
{
  type: "mcp";
  server_label: string;
  server_url: string;         // must be publicly accessible HTTPS
  headers?: Record<string, string>;
  allowed_tools?: string[];
  require_approval?: "always" | "never";
}
```

**Constraint**: OpenAI connects to MCP servers from their cloud. Local stdio processes won't work. Requires a publicly hosted MCP server URL.

## Options

### Option A: CodeTrellis as a Separate 5th Skill

Keep existing skills unchanged. `codetrellis-aware-review` runs as an independent skill with MCP tools alongside Read/Grep/Glob.

```
Skills running per PR:
1. find-warden-bugs         → Read, Grep, Glob
2. architecture-review      → Read, Grep, Glob
3. testing-guidelines       → Read, Grep, Glob
4. code-simplifier          → Read, Grep, Glob
5. codetrellis-aware-review → Read, Grep, Glob + CodeTrellis MCP tools
```

**Pros**: Isolated, no changes to existing skills, MCP failure doesn't break other reviews, easy to test and compare.

**Cons**: Redundant analysis (5 LLM calls per hunk), CodeTrellis context not shared with other skills, higher cost.

### Option B: Inject CodeTrellis MCP Into All Skills

Every skill gains access to CodeTrellis MCP tools. Project context enriches all reviews.

```
Every skill gets:
  Read, Grep, Glob
  + mcp_codetrellis_get_best_practices
  + mcp_codetrellis_get_context_for_file
  + mcp_codetrellis_get_sections
  + mcp_codetrellis_get_filtered_logic
  + mcp_codetrellis_search_matrix
```

**Pros**: All skills benefit from project context, single MCP connection, no redundant skill.

**Cons**: MCP failure breaks all skills, harder to isolate impact, requires provider-layer changes.

### Recommendation

**Start with Option A (Claude provider only)**. Then graduate to Option B once validated.

## Implementation Plan

### Phase 1: Claude MCP Passthrough (Option A, ~20 lines changed)

**Goal**: Let Claude provider pass MCP server config to the SDK so `codetrellis-aware-review` skill can call MCP tools at runtime.

#### Step 1: Add `mcpServers` to `LLMQueryOptions`

**File**: `src/providers/types.ts`

```typescript
export interface LLMQueryOptions {
  // ...existing fields...

  /** MCP server configurations (Claude-only, ignored by other providers) */
  mcpServers?: Record<string, unknown>;
}
```

#### Step 2: Pass `mcpServers` in Claude provider

**File**: `src/providers/claude.ts`

```typescript
const stream = claudeQuery({
  prompt: userPrompt,
  options: {
    // ...existing options...
    allowedTools: ["Read", "Grep", "Glob"],
    // NEW: pass MCP servers if configured
    mcpServers: options.mcpServers as
      | Record<string, import("@anthropic-ai/claude-agent-sdk").McpServerConfig>
      | undefined,
  },
});
```

#### Step 3: Add MCP config to warden.toml schema

**File**: `src/config/schema.ts`

```typescript
// Add to WardenConfigSchema:
mcp: z.record(z.string(), z.object({
  type: z.enum(["stdio", "sse", "http"]).optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  url: z.string().optional(),
  headers: z.record(z.string()).optional(),
})).optional(),
```

**warden.toml** usage:

```toml
[mcp.codetrellis]
command = "codetrellis"
args = ["mcp"]
```

#### Step 4: Thread MCP config through the pipeline

**File**: `src/action/workflow/pr-workflow.ts`

```typescript
// After loading config:
const mcpServers = config.mcp ?? {};

// Pass to executor:
await executeTrigger(trigger, {
  // ...existing options...
  mcpServers,
});
```

**File**: `src/action/triggers/executor.ts` → pass to `runSkillTask()`

**File**: `src/sdk/analyze.ts` → pass to `executeQuery()` → pass to `provider.query()`

#### Step 5: Prerequisite — CodeTrellis matrix in CI

**File**: `.github/workflows/warden-review.yml`

```yaml
steps:
  - uses: actions/checkout@v4

  # NEW: Generate CodeTrellis matrix before Warden runs
  - name: Generate CodeTrellis matrix
    run: |
      pip install codetrellis
      codetrellis scan . --optimal

  - uses: chaudhary-keshav/warden-multi@master
    with:
      provider: openai # or claude for MCP support
```

**Or** commit `.codetrellis/cache/` to the repo (simpler, no CI step needed, but matrix may be stale).

### Phase 2: OpenAI MCP via Local Client (Future)

OpenAI chat completions API doesn't support MCP. Two paths:

#### Path 2a: Switch to OpenAI Responses API

Requires rewriting `OpenAIProvider.query()` to use `client.responses.create()` instead of `client.chat.completions.create()`. MCP servers must be publicly hosted (OpenAI connects server-side).

```typescript
const response = await client.responses.create({
  model,
  input: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
  tools: [
    ...TOOL_DEFINITIONS_OPENAI,
    {
      type: "mcp",
      server_label: "codetrellis",
      server_url: "https://your-codetrellis-mcp-server.example.com",
      allowed_tools: ["get_best_practices", "get_context_for_file", ...],
      require_approval: "never",
    },
  ],
});
```

**Blocker**: Requires a publicly hosted CodeTrellis MCP server. Local stdio process won't work with OpenAI's cloud-connected MCP.

#### Path 2b: Local MCP Client Wrapper

Build a local MCP client in `src/providers/mcp-client.ts` that:

1. Spawns `codetrellis mcp` as a stdio subprocess
2. Discovers available tools via MCP `tools/list`
3. Converts MCP tool schemas to OpenAI/Gemini function-calling format
4. Routes tool calls to the MCP subprocess in the agentic loop

```
analyzeHunk() → provider.query()
  → OpenAI returns tool_call: { name: "mcp_codetrellis_get_best_practices", args: {...} }
  → executeLocalTool() checks: is it an MCP tool?
    → Yes: route to MCP client → MCP subprocess → return result
    → No:  execute locally (Read/Grep/Glob)
  → Send tool result back to OpenAI
```

This adds ~150 lines but makes MCP work with all providers uniformly.

### Phase 3: Option B — MCP for All Skills

Once Phase 1/2 is validated:

1. Move MCP config from per-skill to global (all skills get MCP tools)
2. Update `buildHunkSystemPrompt()` to inject MCP tool descriptions into every skill's system prompt
3. Each skill's prompt doesn't need to reference MCP tools explicitly — the LLM will discover and use them naturally based on context

## Files Changed (Phase 1)

| File                                  | Change                                       |
| ------------------------------------- | -------------------------------------------- |
| `src/providers/types.ts`              | Add `mcpServers?` to `LLMQueryOptions`       |
| `src/providers/claude.ts`             | Pass `mcpServers` to `claudeQuery()` options |
| `src/config/schema.ts`                | Add `mcp` field to `WardenConfigSchema`      |
| `src/action/workflow/pr-workflow.ts`  | Read `config.mcp`, pass to executor          |
| `src/action/triggers/executor.ts`     | Thread `mcpServers` to `runSkillTask()`      |
| `src/sdk/analyze.ts`                  | Thread `mcpServers` to `provider.query()`    |
| `warden.toml`                         | Add `[mcp.codetrellis]` config               |
| `.github/workflows/warden-review.yml` | Add CodeTrellis scan step (optional)         |

## Testing Strategy

1. **Unit test**: `ClaudeProvider.query()` passes `mcpServers` to SDK when present
2. **Unit test**: `mcpServers` absent = no change to existing behavior
3. **Integration test**: Mock MCP server (using `createSdkMcpServer()` from SDK) → verify skill receives tool results
4. **E2E test**: Run `codetrellis-aware-review` skill on PR #1 with Claude provider + MCP enabled → compare findings vs without MCP

## Risk Assessment

| Risk                                      | Severity | Mitigation                                                                        |
| ----------------------------------------- | -------- | --------------------------------------------------------------------------------- |
| MCP server fails to start in CI           | Medium   | Graceful fallback: skill runs without MCP, uses Read/Grep/Glob for manual context |
| MCP adds latency per hunk                 | Low      | CodeTrellis MCP caches matrix in memory after first call                          |
| MCP tools not available for OpenAI/Gemini | Known    | Phase 1 is Claude-only; Phase 2 adds local MCP client                             |
| `codetrellis` not installed in CI runner  | Medium   | Add `pip install codetrellis` to workflow, or pre-bake into Docker image          |
| MCP tool calls increase token usage       | Low      | CodeTrellis returns compressed context (~800 tokens for compact tier)             |
