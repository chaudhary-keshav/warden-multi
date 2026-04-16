/**
 * Google Gemini provider — uses the Google Generative AI SDK with function calling.
 *
 * Maps Warden's tool system (Read, Grep, Glob) to Gemini's function calling API.
 * Runs a tool-use loop similar to the OpenAI provider.
 */
import type { LLMProvider, LLMQueryOptions, LLMQueryResult, AuxiliaryQueryResult, ProviderName } from "./types.js";
import type { UsageStats } from "../types/index.js";
export declare class GeminiProvider implements LLMProvider {
    readonly name: ProviderName;
    readonly defaultModel = "gemini-3.1-pro-preview";
    readonly auxiliaryModel = "gemini-2.5-flash";
    /** Latest Gemini models available */
    static readonly LATEST_MODELS: readonly ["gemini-3.1-pro-preview", "gemini-3-flash-preview", "gemini-2.5-pro", "gemini-2.5-flash"];
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
//# sourceMappingURL=gemini.d.ts.map