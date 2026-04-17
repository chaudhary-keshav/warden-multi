/**
 * Claude provider — wraps the existing Anthropic Claude Code SDK and Messages API.
 *
 * This is the original Warden provider, refactored into the LLMProvider interface.
 * Uses `@anthropic-ai/claude-agent-sdk` for agentic queries (with tool use)
 * and `@anthropic-ai/sdk` for lightweight auxiliary calls via the Messages API.
 */

import {
  query as claudeQuery,
  type SDKResultMessage,
  type McpServerConfig as ClaudeMcpServerConfig,
} from "@anthropic-ai/claude-agent-sdk";
import Anthropic from "@anthropic-ai/sdk";
import type {
  LLMProvider,
  LLMQueryOptions,
  LLMQueryResult,
  AuxiliaryQueryResult,
  ProviderName,
} from "./types.js";
import type { UsageStats } from "../types/index.js";
import { ExecError, execFileNonInteractive } from "../utils/exec.js";
import { WardenAuthenticationError } from "../sdk/errors.js";
import { apiUsageToStats } from "../sdk/pricing.js";
import { emptyUsage, extractUsage } from "../sdk/usage.js";

const CLAUDE_DEFAULT_MODEL = "claude-sonnet-4-20250514";
const CLAUDE_AUXILIARY_MODEL = "claude-haiku-4-5";
const DEFAULT_AUX_MAX_TOKENS = 4096;

export class ClaudeProvider implements LLMProvider {
  readonly name: ProviderName = "claude";
  readonly defaultModel = CLAUDE_DEFAULT_MODEL;
  readonly auxiliaryModel = CLAUDE_AUXILIARY_MODEL;

  async query(options: LLMQueryOptions): Promise<LLMQueryResult> {
    const {
      systemPrompt,
      userPrompt,
      model,
      maxTurns = 50,
      repoPath = process.cwd(),
      abortSignal,
      stderr,
      pathToExecutable,
      mcpServers,
    } = options;

    const stderrChunks: string[] = [];

    const stream = claudeQuery({
      prompt: userPrompt,
      options: {
        maxTurns,
        cwd: repoPath,
        systemPrompt,
        allowedTools: ["Read", "Grep", "Glob"],
        disallowedTools: [
          "Write",
          "Edit",
          "Bash",
          "WebFetch",
          "WebSearch",
          "Task",
          "TodoWrite",
        ],
        permissionMode: "bypassPermissions",
        persistSession: false,
        model,
        abortController: abortSignal
          ? ({ signal: abortSignal } as AbortController)
          : undefined,
        pathToClaudeCodeExecutable: pathToExecutable,
        // Pass MCP servers natively — Claude SDK handles them directly
        ...(mcpServers && Object.keys(mcpServers).length > 0
          ? {
              mcpServers: mcpServers as Record<
                string,
                ClaudeMcpServerConfig
              >,
            }
          : {}),
        stderr: (data: string) => {
          stderrChunks.push(data);
          stderr?.(data);
        },
      },
    });

    let resultMessage: SDKResultMessage | undefined;

    try {
      for await (const message of stream) {
        if (message.type === "result") {
          resultMessage = message;
        }
      }
    } catch (error) {
      const stderrStr = stderrChunks.join("").trim();
      return {
        success: false,
        content: "",
        usage: emptyUsage(),
        model: model ?? CLAUDE_DEFAULT_MODEL,
        error: stderrStr
          ? `${error instanceof Error ? error.message : String(error)}\nClaude Code stderr: ${stderrStr}`
          : error instanceof Error
            ? error.message
            : String(error),
      };
    }

    if (!resultMessage || resultMessage.subtype !== "success") {
      return {
        success: false,
        content: "",
        usage: emptyUsage(),
        model: model ?? CLAUDE_DEFAULT_MODEL,
        error: resultMessage
          ? `SDK result subtype: ${resultMessage.subtype}`
          : "No result from SDK",
      };
    }

    const usage = extractUsage(resultMessage);

    return {
      success: true,
      content: resultMessage.result,
      usage,
      model: model ?? CLAUDE_DEFAULT_MODEL,
      costUSD: resultMessage.total_cost_usd,
    };
  }

  async auxiliaryQuery(options: {
    systemPrompt: string;
    userPrompt: string;
    model?: string;
    apiKey?: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<AuxiliaryQueryResult> {
    const model = options.model ?? CLAUDE_AUXILIARY_MODEL;

    if (!options.apiKey) {
      return {
        success: false,
        content: "",
        usage: emptyUsage(),
        error: "No API key for auxiliary call",
      };
    }

    const client = new Anthropic({ apiKey: options.apiKey });

    try {
      const response = await client.messages.create({
        model,
        max_tokens: options.maxTokens ?? DEFAULT_AUX_MAX_TOKENS,
        system: options.systemPrompt,
        messages: [{ role: "user", content: options.userPrompt }],
      });

      const content = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      const usage = apiUsageToStats(model, response.usage);

      return {
        success: true,
        content,
        usage,
        stopReason: response.stop_reason ?? undefined,
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

  verifyAuth(options: { apiKey?: string; pathToExecutable?: string }): void {
    if (options.apiKey) return;

    try {
      execFileNonInteractive("claude", ["--version"], { timeout: 5000 });
    } catch (error) {
      const isNotFound =
        error instanceof ExecError
          ? error.stderr.includes("ENOENT")
          : (error as NodeJS.ErrnoException).code === "ENOENT";
      if (isNotFound) {
        throw new WardenAuthenticationError(
          "Claude Code CLI not found on PATH.\n" +
            "Either install Claude Code (https://claude.ai/install.sh) or set an API key.",
          { cause: error },
        );
      }
      const detail =
        error instanceof ExecError ? error.stderr : (error as Error).message;
      throw new WardenAuthenticationError(
        `Claude Code CLI found but failed to execute: ${detail}`,
        { cause: error },
      );
    }
  }

  calculateCost(model: string, usage: UsageStats): number {
    return apiUsageToStats(model, {
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      cache_read_input_tokens: usage.cacheReadInputTokens,
      cache_creation_input_tokens: usage.cacheCreationInputTokens,
    }).costUSD;
  }
}
