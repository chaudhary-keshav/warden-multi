/**
 * Google Gemini provider — uses the Google Generative AI SDK with function calling.
 *
 * Maps Warden's tool system (Read, Grep, Glob) to Gemini's function calling API.
 * Runs a tool-use loop similar to the OpenAI provider.
 */

import type {
  LLMProvider,
  LLMQueryOptions,
  LLMQueryResult,
  AuxiliaryQueryResult,
  ProviderName,
  GeminiToolDeclaration,
} from "./types.js";
import type { UsageStats } from "../types/index.js";
import { WardenAuthenticationError } from "../sdk/errors.js";
import { emptyUsage } from "../sdk/usage.js";
import { executeLocalTool, TOOL_DECLARATIONS_GEMINI } from "./tools.js";
import { McpClientManager } from "./mcp-client.js";

const GEMINI_DEFAULT_MODEL = "gemini-3.1-pro-preview";
const GEMINI_AUXILIARY_MODEL = "gemini-2.5-flash";

/** Per-million-token pricing for Gemini models (paid tier, standard) */
const GEMINI_PRICING: Record<
  string,
  { inputPerMTok: number; outputPerMTok: number }
> = {
  // Latest (Gemini 3.x)
  "gemini-3.1-pro-preview": { inputPerMTok: 2.0, outputPerMTok: 12.0 },
  "gemini-3.1-flash-lite-preview": { inputPerMTok: 0.25, outputPerMTok: 1.5 },
  "gemini-3-flash-preview": { inputPerMTok: 0.5, outputPerMTok: 3.0 },
  // Gemini 2.5
  "gemini-2.5-pro": { inputPerMTok: 1.25, outputPerMTok: 10.0 },
  "gemini-2.5-flash": { inputPerMTok: 0.3, outputPerMTok: 2.5 },
  "gemini-2.5-flash-lite": { inputPerMTok: 0.1, outputPerMTok: 0.4 },
  // Gemini 2.0 (deprecated June 2026)
  "gemini-2.0-flash": { inputPerMTok: 0.1, outputPerMTok: 0.4 },
};

export class GeminiProvider implements LLMProvider {
  readonly name: ProviderName = "gemini";
  readonly defaultModel = GEMINI_DEFAULT_MODEL;
  readonly auxiliaryModel = GEMINI_AUXILIARY_MODEL;
  /** Latest Gemini models available */
  static readonly LATEST_MODELS = [
    "gemini-3.1-pro-preview",
    "gemini-3-flash-preview",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
  ] as const;

  async query(options: LLMQueryOptions): Promise<LLMQueryResult> {
    const {
      systemPrompt,
      userPrompt,
      model = GEMINI_DEFAULT_MODEL,
      maxTurns = 50,
      repoPath = process.cwd(),
      apiKey,
      mcpServers,
    } = options;

    if (!apiKey) {
      return {
        success: false,
        content: "",
        usage: emptyUsage(),
        model,
        error:
          "No Gemini API key provided. Set GEMINI_API_KEY or provider.apiKey in warden.toml.",
      };
    }

    // Dynamic import to keep the dependency optional
    const { GoogleGenAI } = await import("@google/genai");
    const client = new GoogleGenAI({ apiKey });

    // Initialize MCP client if configured
    let mcpClient: McpClientManager | undefined;
    let allToolDeclarations: GeminiToolDeclaration[] = [
      ...TOOL_DECLARATIONS_GEMINI,
    ];

    if (mcpServers && Object.keys(mcpServers).length > 0) {
      mcpClient = new McpClientManager(mcpServers);
      try {
        await mcpClient.connect();
        allToolDeclarations = [
          ...TOOL_DECLARATIONS_GEMINI,
          ...mcpClient.getGeminiToolDeclarations(),
        ];
      } catch (error) {
        console.error(
          `::warning::MCP initialization failed, continuing without MCP tools: ${error instanceof Error ? error.message : String(error)}`,
        );
        mcpClient = undefined;
      }
    }

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let turn = 0;

    // Build conversation history for multi-turn tool use
    // Use `any` for contents to avoid fighting with the SDK's complex Part types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contents: any[] = [{ role: "user", parts: [{ text: userPrompt }] }];

    try {
      while (turn < maxTurns) {
        turn++;

        const response = await client.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction: systemPrompt,
            tools: [{ functionDeclarations: allToolDeclarations }],
          },
        });

        // Track usage
        totalInputTokens += response.usageMetadata?.promptTokenCount ?? 0;
        totalOutputTokens += response.usageMetadata?.candidatesTokenCount ?? 0;

        const candidate = response.candidates?.[0];
        if (!candidate?.content?.parts) break;

        const parts = candidate.content.parts;
        const functionCalls = parts.filter((p) => p.functionCall);

        // If no function calls, the model is done
        if (functionCalls.length === 0) {
          const textParts = parts
            .filter((p) => p.text != null)
            .map((p) => p.text ?? "")
            .join("");

          const usage: UsageStats = {
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
            costUSD: 0,
          };
          usage.costUSD = this.calculateCost(model, usage);

          return {
            success: true,
            content: textParts,
            usage,
            model,
            costUSD: usage.costUSD,
          };
        }

        // Add model response to history
        contents.push({
          role: "model",
          parts: candidate.content.parts,
        });

        // Execute tools and add responses
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const toolResponseParts: any[] = [];
        for (const part of functionCalls) {
          const fc = part.functionCall;
          if (!fc) continue;
          const fcName = fc.name ?? "";
          // Route to MCP client or local tool execution
          const toolResult = mcpClient?.isMcpTool(fcName)
            ? await mcpClient.callTool(
                fcName,
                (fc.args as Record<string, unknown>) ?? {},
              )
            : await executeLocalTool(
                fcName,
                (fc.args as Record<string, unknown>) ?? {},
                repoPath,
              );
          toolResponseParts.push({
            functionResponse: {
              name: fc.name,
              response: { result: toolResult },
            },
          });
        }

        contents.push({ role: "user", parts: toolResponseParts });
      }

      // Max turns exceeded
      const usage: UsageStats = {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        costUSD: 0,
      };
      usage.costUSD = this.calculateCost(model, usage);

      return {
        success: true,
        content: "",
        usage,
        model,
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
        model,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      await mcpClient?.close();
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
    const model = options.model ?? GEMINI_AUXILIARY_MODEL;

    if (!options.apiKey) {
      return {
        success: false,
        content: "",
        usage: emptyUsage(),
        error: "No Gemini API key",
      };
    }

    const { GoogleGenAI } = await import("@google/genai");
    const client = new GoogleGenAI({ apiKey: options.apiKey });

    try {
      const response = await client.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: options.userPrompt }] }],
        config: {
          systemInstruction: options.systemPrompt,
          maxOutputTokens: options.maxTokens ?? 4096,
          temperature: options.temperature ?? 0,
        },
      });

      const content =
        response.candidates?.[0]?.content?.parts
          ?.filter((p) => p.text != null)
          .map((p) => p.text ?? "")
          .join("") ?? "";

      const usage: UsageStats = {
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        costUSD: 0,
      };
      usage.costUSD = this.calculateCost(model, usage);

      return {
        success: true,
        content,
        usage,
        stopReason: response.candidates?.[0]?.finishReason ?? undefined,
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
        "No Gemini API key provided.\n" +
          "Set GEMINI_API_KEY environment variable or provider.apiKey in warden.toml.",
      );
    }
  }

  calculateCost(model: string, usage: UsageStats): number {
    const pricing = GEMINI_PRICING[model];
    if (!pricing) return 0;
    return (
      (usage.inputTokens * pricing.inputPerMTok) / 1_000_000 +
      (usage.outputTokens * pricing.outputPerMTok) / 1_000_000
    );
  }
}
