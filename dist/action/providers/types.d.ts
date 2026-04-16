/**
 * Provider abstraction layer for multi-LLM support.
 *
 * This module defines the contract that all LLM providers must implement.
 * Warden's SDK analyze layer calls into this interface instead of directly
 * using the Anthropic SDK, making GPT and Gemini first-class alternatives.
 */
import type { UsageStats } from "../types/index.js";
/** Supported provider identifiers */
export type ProviderName = "claude" | "openai" | "gemini";
/**
 * A single message in a query to the LLM.
 */
export interface LLMMessage {
    role: "system" | "user" | "assistant";
    content: string;
}
/**
 * Tool definition that can be passed to the LLM.
 * Each provider maps these to its native tool/function calling format.
 */
export interface LLMToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}
/**
 * Configuration for a provider query.
 */
export interface LLMQueryOptions {
    /** System prompt */
    systemPrompt: string;
    /** User prompt */
    userPrompt: string;
    /** Model identifier (provider-specific, e.g. 'gpt-4o', 'gemini-2.5-pro') */
    model?: string;
    /** Max conversation turns for agentic tool use */
    maxTurns?: number;
    /** Repository path for file-reading tools */
    repoPath?: string;
    /** Tool names the LLM is allowed to use */
    allowedTools?: string[];
    /** Tool names explicitly blocked */
    disallowedTools?: string[];
    /** Abort signal for cancellation */
    abortSignal?: AbortSignal;
    /** API key for this provider */
    apiKey?: string;
    /** Max tokens in the response */
    maxTokens?: number;
    /** Temperature (0-1) */
    temperature?: number;
    /** Callback for stderr output (Claude-specific, ignored by others) */
    stderr?: (data: string) => void;
    /** Path to CLI executable (Claude-specific) */
    pathToExecutable?: string;
}
/**
 * Result from an LLM query.
 * Normalized across all providers into a common shape.
 */
export interface LLMQueryResult {
    /** Whether the query completed successfully */
    success: boolean;
    /** The text content of the LLM's response */
    content: string;
    /** Token usage and cost */
    usage: UsageStats;
    /** The model that actually responded (may differ from requested model) */
    model: string;
    /** Provider-specific error message if success=false */
    error?: string;
    /** Total cost in USD (if the provider reports it) */
    costUSD?: number;
}
/**
 * Result from a lightweight auxiliary LLM call (extraction repair, dedup, etc.).
 */
export interface AuxiliaryQueryResult {
    /** Whether the query completed successfully */
    success: boolean;
    /** The text content of the response */
    content: string;
    /** Token usage */
    usage: UsageStats;
    /** Stop reason */
    stopReason?: string;
    /** Error message if failed */
    error?: string;
}
/**
 * The interface every LLM provider must implement.
 *
 * Two tiers of API:
 * 1. `query()` — Full agentic analysis with tool use (Read, Grep, Glob).
 *    This is the primary analysis path.
 * 2. `auxiliaryQuery()` — Lightweight, cheap call for extraction repair,
 *    semantic dedup, etc. Uses the provider's cheapest model.
 */
export interface LLMProvider {
    /** Provider identifier */
    readonly name: ProviderName;
    /** Default model for primary analysis */
    readonly defaultModel: string;
    /** Default model for cheap auxiliary tasks */
    readonly auxiliaryModel: string;
    /**
     * Run a full agentic query with optional tool use.
     * This is the main analysis call — sends the prompt to the LLM and
     * returns its response with findings.
     */
    query(options: LLMQueryOptions): Promise<LLMQueryResult>;
    /**
     * Run a lightweight auxiliary query (no tools, structured output).
     * Used for extraction repair, semantic dedup, fix evaluation, etc.
     */
    auxiliaryQuery(options: {
        systemPrompt: string;
        userPrompt: string;
        model?: string;
        apiKey?: string;
        maxTokens?: number;
        temperature?: number;
    }): Promise<AuxiliaryQueryResult>;
    /**
     * Verify that authentication will work before starting analysis.
     * Throws WardenAuthenticationError on failure.
     */
    verifyAuth(options: {
        apiKey?: string;
        pathToExecutable?: string;
    }): void;
    /**
     * Calculate cost from token counts for a given model.
     */
    calculateCost(model: string, usage: UsageStats): number;
}
//# sourceMappingURL=types.d.ts.map