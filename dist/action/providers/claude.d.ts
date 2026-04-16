/**
 * Claude provider — wraps the existing Anthropic Claude Code SDK and Messages API.
 *
 * This is the original Warden provider, refactored into the LLMProvider interface.
 * Uses `@anthropic-ai/claude-agent-sdk` for agentic queries (with tool use)
 * and `@anthropic-ai/sdk` for lightweight auxiliary calls via the Messages API.
 */
import type { LLMProvider, LLMQueryOptions, LLMQueryResult, AuxiliaryQueryResult, ProviderName } from "./types.js";
import type { UsageStats } from "../types/index.js";
export declare class ClaudeProvider implements LLMProvider {
    readonly name: ProviderName;
    readonly defaultModel = "claude-sonnet-4-20250514";
    readonly auxiliaryModel = "claude-haiku-4-5";
    query(options: LLMQueryOptions): Promise<LLMQueryResult>;
    auxiliaryQuery(options: {
        systemPrompt: string;
        userPrompt: string;
        model?: string;
        apiKey?: string;
        maxTokens?: number;
        temperature?: number;
    }): Promise<AuxiliaryQueryResult>;
    verifyAuth(options: {
        apiKey?: string;
        pathToExecutable?: string;
    }): void;
    calculateCost(model: string, usage: UsageStats): number;
}
//# sourceMappingURL=claude.d.ts.map