import { describe, it, expect, vi } from "vitest";
import { compactReasoning } from "./compactor.js";
import type { SkillStepResult } from "./types.js";
import type { LLMProvider } from "../providers/types.js";

function createMockProvider(
  response: { success: boolean; content: string } = {
    success: true,
    content: "- Files analyzed: src/foo.ts\n- Patterns: none",
  },
): LLMProvider {
  return {
    name: "openai",
    defaultModel: "gpt-5.2",
    auxiliaryModel: "gpt-4o-mini",
    query: vi.fn(),
    auxiliaryQuery: vi.fn().mockResolvedValue({
      ...response,
      usage: { inputTokens: 100, outputTokens: 50, costUSD: 0.001 },
      stopReason: "end_turn",
    }),
    verifyAuth: vi.fn(),
    calculateCost: vi.fn().mockReturnValue(0),
  };
}

function createStepResult(
  overrides: Partial<SkillStepResult> = {},
): SkillStepResult {
  return {
    skill: "find-warden-bugs",
    findings: [],
    reasoningTraces: [
      "Analyzed error handling patterns in src/sdk/analyze.ts",
      "Checked retry logic for race conditions",
    ],
    fileNotes: { "src/sdk/analyze.ts": "Complex retry logic" },
    usage: { inputTokens: 1000, outputTokens: 200, costUSD: 0.01 },
    report: {
      skill: "find-warden-bugs",
      summary: "Found 0 issues",
      findings: [],
    },
    ...overrides,
  };
}

describe("compactReasoning", () => {
  it("returns compacted context from provider", async () => {
    const provider = createMockProvider();
    const result = await compactReasoning(createStepResult(), "", provider);

    expect(result.context).toBe(
      "- Files analyzed: src/foo.ts\n- Patterns: none",
    );
    expect(result.usage.inputTokens).toBe(100);
    expect(provider.auxiliaryQuery).toHaveBeenCalledOnce();
  });

  it("skips compaction when no reasoning traces", async () => {
    const provider = createMockProvider();
    const result = await compactReasoning(
      createStepResult({ reasoningTraces: [] }),
      "prior context",
      provider,
    );

    expect(result.context).toBe("prior context");
    expect(result.usage.inputTokens).toBe(0);
    expect(provider.auxiliaryQuery).not.toHaveBeenCalled();
  });

  it("includes prior context in user prompt", async () => {
    const provider = createMockProvider();
    await compactReasoning(
      createStepResult(),
      "Previous skill found 3 issues in auth module",
      provider,
    );

    const call = vi.mocked(provider.auxiliaryQuery).mock.calls[0]![0];
    expect(call.userPrompt).toContain(
      "Previous skill found 3 issues in auth module",
    );
  });

  it("uses temperature 0 for deterministic compaction", async () => {
    const provider = createMockProvider();
    await compactReasoning(createStepResult(), "", provider);

    const call = vi.mocked(provider.auxiliaryQuery).mock.calls[0]![0];
    expect(call.temperature).toBe(0);
  });

  it("falls back to skip when provider fails", async () => {
    const provider = createMockProvider();
    vi.mocked(provider.auxiliaryQuery).mockRejectedValue(
      new Error("API error"),
    );

    const result = await compactReasoning(
      createStepResult(),
      "existing context",
      provider,
    );

    expect(result.context).toBe("existing context");
    expect(result.usage.inputTokens).toBe(0);
  });

  it("falls through to simple compaction when full compaction returns empty", async () => {
    const provider = createMockProvider();
    vi.mocked(provider.auxiliaryQuery)
      .mockResolvedValueOnce({
        success: true,
        content: "",
        usage: { inputTokens: 10, outputTokens: 0, costUSD: 0 },
        stopReason: "end_turn",
      })
      .mockResolvedValueOnce({
        success: true,
        content: "- Simple summary bullet",
        usage: { inputTokens: 20, outputTokens: 10, costUSD: 0.0001 },
        stopReason: "end_turn",
      });

    const result = await compactReasoning(createStepResult(), "", provider);

    expect(result.context).toBe("- Simple summary bullet");
    expect(provider.auxiliaryQuery).toHaveBeenCalledTimes(2);
  });
});
