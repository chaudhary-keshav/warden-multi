/**
 * OpenAI GPT provider — uses the OpenAI SDK with function calling.
 *
 * Maps Warden's tool system (Read, Grep, Glob) to OpenAI function calling.
 * For agentic queries, runs a tool-use loop: send prompt → get function calls →
 * execute tools locally → send results back → repeat until done.
 */
import type { LLMProvider, LLMQueryOptions, LLMQueryResult, AuxiliaryQueryResult, ProviderName } from "./types.js";
import type { UsageStats } from "../types/index.js";
export declare class OpenAIProvider implements LLMProvider {
    readonly name: ProviderName;
    readonly defaultModel = "gpt-5.2";
    readonly auxiliaryModel = "gpt-4o-mini";
    /** Models the user has configured for this project */
    static readonly CONFIGURED_MODELS: readonly ["gpt-5.2", "gpt-5.1-codex-max", "gpt-4o-mini"];
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
    }): void;
    calculateCost(model: string, usage: UsageStats): number;
}
//# sourceMappingURL=openai.d.ts.map