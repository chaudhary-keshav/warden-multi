/**
 * OpenAI GPT provider — uses the OpenAI SDK with function calling.
 *
 * Maps Warden's tool system (Read, Grep, Glob) to OpenAI function calling.
 * For agentic queries, runs a tool-use loop: send prompt → get function calls →
 * execute tools locally → send results back → repeat until done.
 */

import type {
  LLMProvider,
  LLMQueryOptions,
  LLMQueryResult,
  AuxiliaryQueryResult,
  ProviderName,
} from "./types.js";
import type { UsageStats } from "../types/index.js";
import { WardenAuthenticationError } from "../sdk/errors.js";
import { emptyUsage } from "../sdk/usage.js";
import { executeLocalTool, TOOL_DEFINITIONS_OPENAI } from "./tools.js";

const OPENAI_DEFAULT_MODEL = "gpt-5.2";
const OPENAI_AUXILIARY_MODEL = "gpt-4o-mini";

/** Per-million-token pricing for OpenAI models (from platform.openai.com/docs/pricing) */
const OPENAI_PRICING: Record<
  string,
  { inputPerMTok: number; outputPerMTok: number }
> = {
  // GPT-5.2 family
  "gpt-5.2": { inputPerMTok: 1.75, outputPerMTok: 14.0 },
  "gpt-5.2-pro": { inputPerMTok: 21.0, outputPerMTok: 168.0 },
  // GPT-5.1
  "gpt-5.1": { inputPerMTok: 1.25, outputPerMTok: 10.0 },
  // GPT-5 family
  "gpt-5": { inputPerMTok: 1.25, outputPerMTok: 10.0 },
  "gpt-5-mini": { inputPerMTok: 0.25, outputPerMTok: 2.0 },
  "gpt-5-nano": { inputPerMTok: 0.05, outputPerMTok: 0.4 },
  "gpt-5-pro": { inputPerMTok: 15.0, outputPerMTok: 120.0 },
  // GPT-4.1 family
  "gpt-4.1": { inputPerMTok: 2.0, outputPerMTok: 8.0 },
  "gpt-4.1-mini": { inputPerMTok: 0.4, outputPerMTok: 1.6 },
  "gpt-4.1-nano": { inputPerMTok: 0.1, outputPerMTok: 0.4 },
  // GPT-4o family
  "gpt-4o": { inputPerMTok: 2.5, outputPerMTok: 10.0 },
  "gpt-4o-mini": { inputPerMTok: 0.15, outputPerMTok: 0.6 },
  // Reasoning models
  o3: { inputPerMTok: 2.0, outputPerMTok: 8.0 },
  "o4-mini": { inputPerMTok: 1.1, outputPerMTok: 4.4 },
};

export class OpenAIProvider implements LLMProvider {
  readonly name: ProviderName = "openai";
  readonly defaultModel = OPENAI_DEFAULT_MODEL;
  readonly auxiliaryModel = OPENAI_AUXILIARY_MODEL;
  /** Models the user has configured for this project */
  static readonly CONFIGURED_MODELS = [
    "gpt-5.2",
    "gpt-5.1-codex-max",
    "gpt-4o-mini",
  ] as const;

  async query(options: LLMQueryOptions): Promise<LLMQueryResult> {
    const {
      systemPrompt,
      userPrompt,
      model = OPENAI_DEFAULT_MODEL,
      maxTurns = 50,
      repoPath = process.cwd(),
      abortSignal,
      apiKey,
    } = options;

    if (!apiKey) {
      return {
        success: false,
        content: "",
        usage: emptyUsage(),
        model,
        error:
          "No OpenAI API key provided. Set OPENAI_API_KEY or provider.apiKey in warden.toml.",
      };
    }

    // Dynamic import to avoid requiring openai when using other providers
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: any[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let lastModel = model;
    let turn = 0;

    try {
      // Agentic tool-use loop
      while (turn < maxTurns) {
        turn++;

        const response = await client.chat.completions.create(
          {
            model,
            messages: messages as Parameters<
              typeof client.chat.completions.create
            >[0]["messages"],
            tools: TOOL_DEFINITIONS_OPENAI,
            tool_choice: "auto",
          },
          abortSignal ? { signal: abortSignal } : undefined,
        );

        const choice = response.choices[0];
        if (!choice) break;

        lastModel = response.model ?? model;
        totalInputTokens += response.usage?.prompt_tokens ?? 0;
        totalOutputTokens += response.usage?.completion_tokens ?? 0;

        const assistantMessage = choice.message;

        // If no tool calls, the model is done
        if (!assistantMessage.tool_calls?.length) {
          const usage: UsageStats = {
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
            costUSD: this.calculateCost(lastModel, {
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
              cacheReadInputTokens: 0,
              cacheCreationInputTokens: 0,
              costUSD: 0,
            }),
          };

          return {
            success: true,
            content: assistantMessage.content ?? "",
            usage,
            model: lastModel,
            costUSD: usage.costUSD,
          };
        }

        // Process tool calls — include tool_calls in assistant message
        messages.push({
          role: "assistant",
          content: assistantMessage.content ?? "",
          tool_calls: assistantMessage.tool_calls,
        });

        for (const toolCall of assistantMessage.tool_calls) {
          if (toolCall.type !== "function") continue;
          const fn = toolCall.function;
          const args = JSON.parse(fn.arguments);
          const toolResult = await executeLocalTool(fn.name, args, repoPath);

          messages.push({
            role: "tool",
            content: toolResult,
            tool_call_id: toolCall.id,
          });
        }
      }

      // Max turns exceeded — return what we have
      const lastContent =
        messages.filter((m) => m["role"] === "assistant").pop()?.["content"] ??
        "";
      const usage: UsageStats = {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        costUSD: this.calculateCost(lastModel, {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
          costUSD: 0,
        }),
      };

      return {
        success: true,
        content: lastContent,
        usage,
        model: lastModel,
        costUSD: usage.costUSD,
      };
    } catch (error) {
      return {
        success: false,
        content: "",
        usage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
          costUSD: 0,
        },
        model: lastModel,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async auxiliaryQuery(options: {
    systemPrompt: string;
    userPrompt: string;
    model?: string;
    apiKey?: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<AuxiliaryQueryResult> {
    const model = options.model ?? OPENAI_AUXILIARY_MODEL;

    if (!options.apiKey) {
      return {
        success: false,
        content: "",
        usage: emptyUsage(),
        error: "No OpenAI API key",
      };
    }

    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey: options.apiKey });

    try {
      const response = await client.chat.completions.create({
        model,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0,
        messages: [
          { role: "system", content: options.systemPrompt },
          { role: "user", content: options.userPrompt },
        ],
      });

      const content = response.choices[0]?.message?.content ?? "";
      const usage: UsageStats = {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        costUSD: 0,
      };
      usage.costUSD = this.calculateCost(model, usage);

      return {
        success: true,
        content,
        usage,
        stopReason: response.choices[0]?.finish_reason ?? undefined,
      };
    } catch (error) {
      return {
        success: false,
        content: "",
        usage: emptyUsage(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  verifyAuth(options: { apiKey?: string }): void {
    if (!options.apiKey) {
      throw new WardenAuthenticationError(
        "No OpenAI API key provided.\n" +
          "Set OPENAI_API_KEY environment variable or provider.apiKey in warden.toml.",
      );
    }
  }

  calculateCost(model: string, usage: UsageStats): number {
    const pricing = OPENAI_PRICING[model];
    if (!pricing) return 0;
    return (
      (usage.inputTokens * pricing.inputPerMTok) / 1_000_000 +
      (usage.outputTokens * pricing.outputPerMTok) / 1_000_000
    );
  }
}
