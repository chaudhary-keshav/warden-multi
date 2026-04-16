import type { UsageStats } from '../types/index.js';
/**
 * Usage shape returned by the Anthropic Messages API.
 */
interface ApiUsage {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
}
/**
 * Convert Anthropic API usage to our UsageStats format.
 * Calculates cost from token counts using model pricing.
 *
 * The Anthropic API reports `input_tokens` as only the non-cached portion.
 * We normalize so that `inputTokens` is the *total* input tokens
 * (non-cached + cache_read + cache_creation), with the cache fields
 * being subsets of that total.
 */
export declare function apiUsageToStats(model: string, usage: ApiUsage): UsageStats;
export {};
//# sourceMappingURL=pricing.d.ts.map