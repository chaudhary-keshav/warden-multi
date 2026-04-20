# Research: How VS Code Copilot Chat Handles Context Compaction & Multi-Model Communication

> Analysis of `microsoft/vscode-copilot-chat` repo (public, MIT licensed)
> Key files analyzed: `agentIntent.ts`, `toolCallingLoop.ts`, `backgroundSummarizer.ts`, `summarizedConversationHistory.tsx`, `agentPrompt.tsx`

---

## Executive Summary

Copilot Chat uses a **three-tier compaction system** with **four summarization strategies** that progressively compact conversation history as the context window fills. The system is designed around a **dual-threshold state machine** that balances latency (background pre-compaction) with correctness (foreground synchronous compaction). The multi-model pattern uses the **same primary model** for summarization but in a **separate LLM call** with `tool_choice: 'none'` and `temperature: 0`.

---

## 1. Architecture Overview

### Three Tiers of Context Management

```
┌─────────────────────────────────────────────────────────────────┐
│                    AgentIntent (agentIntent.ts)                  │
│                    ─────────────────────────                     │
│  Orchestrator: decides WHEN and HOW to compact                  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Tier 1: Background Compaction (async, speculative)     │    │
│  │  State machine: Idle → InProgress → Completed/Failed    │    │
│  │  Triggered at ≥80% context usage (post-render check)    │    │
│  │  Applied at ≥95% or when completed before next render   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Tier 2: Foreground Compaction (sync, on-demand)        │    │
│  │  Triggered when BudgetExceededError is thrown            │    │
│  │  Blocks the agent loop until summary is ready           │    │
│  │  Fallback if background compaction fails/unavailable     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Tier 3: Inline Summarization (within agent loop)       │    │
│  │  Appends "<summarize now>" instruction to user message   │    │
│  │  Model outputs summary instead of tool calls            │    │
│  │  No extra LLM call — reuses the main model iteration    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Tier 0: Responses API Context Management (server-side) │    │
│  │  OpenAI-native truncation — bypasses all client-side    │    │
│  │  compaction when available for the model family          │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Background Compaction (Speculative Pre-compaction)

**File:** `backgroundSummarizer.ts` (125 lines) + `agentIntent.ts`

### State Machine

```
Idle ──── start() ────→ InProgress ────→ Completed
                              │                │
                              │         consumeAndReset() → Idle
                              │
                              └────→ Failed
                                       │
                                   start() → InProgress (retry)
```

### Threshold Logic (Dual-Threshold)

```typescript
// Post-render check in agentIntent.ts:
const contextRatio = (tokenCount + toolTokens) / baseBudget;

if (contextRatio >= 0.95 && bg.state === "InProgress") {
  // BLOCK: wait for background compaction to finish, then apply
  await bg.waitForCompletion();
  result = bg.consumeAndReset();
  // Apply summary to rounds, re-render
} else if (
  contextRatio >= 0.8 &&
  (bg.state === "Idle" || bg.state === "Failed")
) {
  // KICK OFF: start background compaction speculatively
  this._startBackgroundSummarization(bg, props, token, contextRatio);
}
```

### Key Design Decision: Snapshot Isolation

When starting background compaction, the tool call rounds and results are **deep-copied** so the background render sees a frozen snapshot and doesn't drift as the main loop adds new rounds:

```typescript
const snapshotProps = {
  ...props,
  promptContext: {
    ...props.promptContext,
    toolCallRounds: [...props.promptContext.toolCallRounds],
    toolCallResults: { ...props.promptContext.toolCallResults },
  },
};
```

---

## 3. Foreground Compaction (Synchronous Fallback)

**File:** `summarizedConversationHistory.tsx` (1138 lines)

### Two Modes: Full vs Simple

```typescript
enum SummaryMode {
  Simple = "simple", // Lightweight, fewer tokens
  Full = "full", // Full context with tool definitions
}

// Fallback chain:
// 1. Try Full mode
// 2. If Full fails (any error except cancellation) → fallback to Simple
// 3. If Simple fails → render without summarization
```

### Full Mode: Tools with `tool_choice: 'none'`

In Full mode, the summarization call includes ALL tool definitions alongside the messages, but forces `tool_choice: 'none'` so the model understands the tool context without actually calling any:

```typescript
const toolOpts = normalizedTools?.length
  ? {
      tool_choice: "none" as const,
      tools: normalizedTools,
    }
  : undefined;

summaryResponse = await endpoint.makeChatRequest2({
  debugName: `summarizeConversationHistory-${mode}`,
  messages,
  requestOptions: {
    temperature: 0,
    stream: false,
    ...toolOpts,
  },
});
```

### Budget for Tools in Summarization

```typescript
// Reserve budget for tools in Full mode:
const toolTokens =
  mode === SummaryMode.Full && tools?.length
    ? await endpoint.acquireTokenizer().countToolTokens(tools)
    : 0;

const endpoint =
  toolTokens > 0
    ? endpoint.cloneWithTokenOverride(
        Math.max(1, Math.floor((modelMaxPromptTokens - toolTokens) * 0.9)),
      )
    : endpoint;
```

### Summary Size Validation

After generating a summary, it's validated against the effective budget. If too large, the summary is rejected:

```typescript
const summarySize = await this.sizing.countTokens(response.value);
const effectiveBudget = maxSummaryTokens
  ? Math.min(tokenBudget, maxSummaryTokens)
  : tokenBudget;

if (summarySize > effectiveBudget) {
  throw new Error("Summary too large");
}
```

---

## 4. Inline Summarization (Zero Extra LLM Calls)

**Files:** `agentIntent.ts`, `toolCallingLoop.ts`, `summarizedConversationHistory.tsx`

This is the newest and most elegant approach — instead of making a separate LLM call for summarization, it **injects a summarization instruction into the next agent loop iteration** and tells the model to output only a summary (no tool calls).

### Triggering

```typescript
// Proactive pre-render check (before the main render):
if (inlineSummarizationEnabled && baseBudget > 0) {
  const preRenderRatio = (_lastRenderTokenCount + toolTokens) / baseBudget;
  if (preRenderRatio >= 0.85) {
    proactiveInlineSummarization = true;
  }
}

// Budget expansion: give 15% more room for the summarization iteration
const expandedEndpoint = endpoint.cloneWithTokenOverride(
  modelMaxPromptTokens * 1.15, // INLINE_SUMMARIZATION_BUDGET_EXPANSION
);
```

### User Message Injection

```tsx
class InlineSummarizationUserMessage extends PromptElement {
  async render() {
    return (
      <UserMessage priority={1000}>
        The conversation has grown too large for the context window and must be
        compacted now.
        {SummaryPrompt} {/* Full summarization instructions */}
        IMPORTANT: Output your summary wrapped in <summary> and </summary> tags.
        Do NOT call any tools.
      </UserMessage>
    );
  }
}
```

### Summary Extraction (in toolCallingLoop.ts)

After the model responds (with no tool calls), the summary is extracted:

```typescript
if (result.inlineSummarizationRequested && !result.round.toolCalls.length) {
  const summaryText = extractInlineSummary(result.round.response);
  if (summaryText !== undefined) {
    const summarizedRound = this.applySummaryToRound(summaryText);
    // Remove the summarization round from display
    this.toolCallRounds.pop();
    continue; // Continue the agent loop with compacted history
  }
}
```

### Extraction with Multi-level Fallback

```typescript
function extractInlineSummary(responseText: string): string | undefined {
  const openTag = "<summary>";
  const closeTag = "</summary>";
  const openIdx = responseText.indexOf(openTag);

  if (openIdx !== -1) {
    const contentStart = openIdx + openTag.length;
    const closeIdx = responseText.indexOf(closeTag, contentStart);
    if (closeIdx !== -1) {
      return responseText.substring(contentStart, closeIdx).trim(); // Clean
    }
    return responseText.substring(contentStart).trim(); // Partial
  }
  return undefined; // No tags — fallback to separate-call summarization
}
```

---

## 5. The Summarization Prompt (What Gets Preserved)

**The core prompt is comprehensive and structured** — it's essentially the same format you see in `<conversation-summary>` blocks:

### Required Sections

1. **`<analysis>`** — Chronological Review, Intent Mapping, Technical Inventory, Code Archaeology, Progress Assessment, Context Validation, Recent Commands Analysis
2. **`<summary>`** — Conversation Overview, Technical Foundation, Codebase Status, Problem Resolution, Progress Tracking, Active Work State, Recent Operations, Continuation Plan

### Key Design Principles

- **Precision**: Exact filenames, function names, variable names
- **Completeness**: All context needed to continue without re-reading
- **Verbatim Accuracy**: Direct quotes for task specifications
- **Technical Depth**: Complex technical decisions and code patterns
- **Recent Operations**: Last agent commands and tool results (most important for continuation)

### Transcript Fallback

After compaction, the summary includes a **transcript reference** so the model can look up original details:

```typescript
if (transcriptPath) {
  summary += `\nIf you need specific details from before compaction...
    use the read_file tool to look up the full uncompacted conversation
    transcript at: "${transcriptPath}"`;
  summary += `\nAt the time of this request, the transcript has ${lineCount} lines.`;
}
```

---

## 6. Multi-Model Communication (Subagents)

**Files:** `searchSubagentPrompt.tsx`, `executionSubagentPrompt.tsx`

Copilot uses **dedicated subagent tools** that the primary model can invoke:

| Subagent               | Purpose                                     | Model Strategy               |
| ---------------------- | ------------------------------------------- | ---------------------------- |
| **Search Subagent**    | Codebase search via SFT+RL CAPI proxy model | Specialized fine-tuned model |
| **Execution Subagent** | Execute specific code tasks                 | Same or different model      |

### Subagent Lifecycle

```
Parent Agent Loop
  │
  ├── Tool call: search_subagent(query)
  │     └── Creates new ToolCallingLoop with subagent prompt
  │         ├── SubagentStart hook (additional context injection)
  │         ├── Runs autonomous loop until done
  │         ├── SubagentStop hook (can block stopping)
  │         └── Returns result to parent
  │
  ├── Tool call: execution_subagent(task)
  │     └── Similar lifecycle
  │
  └── Continues with subagent results in context
```

### Key Multi-Model Decisions

1. **Same model for summarization** — Copilot does NOT use a cheap model for compaction. It uses the same primary model (`temperature: 0`, `stream: false`) to ensure quality.
2. **Specialized models for subagents** — Search uses SFT+RL fine-tuned model via CAPI proxy.
3. **Model-specific prompt customization** — `PromptRegistry` resolves different system prompts for `claude-*`, `gpt-*`, `gemini-*` families.
4. **Anthropic-specific handling** — Thinking blocks, cache breakpoints, tool_search stripping.

---

## 7. How History Renders After Compaction

When a summary exists on a tool call round, the `ConversationHistory` component renders:

```
[Summary of everything before round K]  ← <conversation-summary> UserMessage
[Round K tool calls + results]          ← Last real tool call round (kept verbatim)
[Current user message]                  ← New request
```

All turns before the summarized round are **dropped entirely** — the summary replaces them.

```typescript
// In ConversationHistory.render():
for (const turn of history.reverse()) {
  // ... render tool call rounds ...
  if (summaryForTurn) {
    // All preceding turns are covered by the summary
    break; // ← stops iterating through history
  }
}
```

---

## 8. Applicability to Warden's Sequential Pipeline

### What Copilot Does That Warden Should Adopt

| Pattern                       | Copilot Implementation                                         | Warden Adaptation                                                     |
| ----------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Structured summary format** | `<analysis>` + `<summary>` with 8 required sections            | Use same format for inter-skill context handoff                       |
| **Background pre-compaction** | Kick off at 80%, apply at 95% or next render                   | Pre-compact after each skill completes while next skill starts        |
| **Inline summarization**      | No extra LLM call, model outputs summary instead of tool calls | Could use for intra-skill compaction if a single skill exceeds budget |
| **Transcript fallback**       | Full conversation saved to disk, path embedded in summary      | Save full skill output to temp file, reference in compacted context   |
| **Summary size validation**   | Reject summaries that exceed token budget                      | Validate compacted context stays under target budget                  |
| **Snapshot isolation**        | Deep-copy context before background compaction                 | Deep-copy pipeline state before passing to compaction                 |
| **Fallback chain**            | Full → Simple → No summarization                               | Primary compaction → Simple → Skip                                    |

### What Copilot Does Differently That We Should Note

| Aspect               | Copilot                                                     | Warden Should Do Instead                                                                           |
| -------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Compaction model** | Same primary model (gpt-4o/claude)                          | Use cheap model (gpt-4o-mini) — Warden's context is simpler than Copilot's multi-turn conversation |
| **When to compact**  | Reactively when budget exceeded                             | Proactively after every skill step (pipeline design)                                               |
| **What to compact**  | Full conversation (user messages, tool calls, tool results) | Only skill reasoning traces (findings pass through unchanged)                                      |
| **Context window**   | Single growing conversation                                 | Fresh context per skill with accumulated compact state injected                                    |

### Key Takeaways for Implementation

1. **Use structured compaction prompts** — Copilot's 8-section format is battle-tested. Adapt it for code review context (files analyzed, patterns found, coverage gaps, dedup hints).

2. **Budget expansion for summarization** — Copilot uses `1.15x` budget expansion for inline summarization. When compacting between skills, allocate a fixed token budget for the compaction step.

3. **Summary validation is critical** — Always verify the compacted output fits the target budget before injecting into the next skill's prompt.

4. **Background compaction is a latency optimization** — Start compacting skill N's output while skill N+1 is running its initial analysis, then inject the compacted context mid-stream.

5. **Transcript/raw fallback** — Always save the full raw output alongside the compacted version so downstream skills can access details if needed.

6. **Temperature 0 for summarization** — Deterministic summarization avoids information loss.

---

## 9. Recommended Changes to PLAN-sequential-pipeline.md

Based on this research, the following enhancements to the existing plan are recommended:

### A. Adopt Structured Compaction Format

Replace the free-form compaction prompt with a structured format inspired by Copilot:

```
<analysis>
  - Files analyzed: [list with 1-line observation each]
  - Patterns observed: [anti-patterns, style issues, concerns]
  - Coverage gaps: [areas this skill did NOT analyze]
  - Key architectural observations: [cross-cutting concerns]
</analysis>

<compact-context>
  - Prior skills completed: [list]
  - Accumulated findings count: [N]
  - Dedup hints: [findings already reported, don't re-report]
  - Focus areas for next skill: [based on gaps]
</compact-context>
```

### B. Add Summary Size Validation

```typescript
const compactedTokens = await tokenizer.countTokens(compactedContext);
const MAX_COMPACT_TOKENS = 2000;

if (compactedTokens > MAX_COMPACT_TOKENS) {
  // Re-compact with stricter instructions
  compactedContext = await reCompact(compactedContext, MAX_COMPACT_TOKENS);
}
```

### C. Consider Background Compaction Between Skills

```
Skill 1 finishes → Start compaction in background
                 → Start Skill 2 immediately (without prior context)
                 → When compaction completes, inject into Skill 2's next hunk batch
```

### D. Add Inline Summarization as Fallback

If a skill's reasoning exceeds the context window mid-execution, use Copilot's inline summarization pattern to compact within the skill before continuing.

---

## 10. File Reference Map

| File                                | Lines | Role                                                                                    |
| ----------------------------------- | ----- | --------------------------------------------------------------------------------------- |
| `agentIntent.ts`                    | 1021  | **Orchestrator** — decides when/how to compact, manages background summarizer lifecycle |
| `toolCallingLoop.ts`                | 1881  | **Agent loop** — handles inline summarization extraction, round management              |
| `summarizedConversationHistory.tsx` | 1138  | **Prompt builder** — renders summarization prompt, executes LLM call, validates output  |
| `backgroundSummarizer.ts`           | 125   | **State machine** — Idle/InProgress/Completed/Failed lifecycle                          |
| `agentPrompt.tsx`                   | 802   | **Main prompt** — renders full agent prompt with conversation history                   |
| `promptRegistry.ts`                 | —     | **Model routing** — resolves model-specific prompt customizations                       |
