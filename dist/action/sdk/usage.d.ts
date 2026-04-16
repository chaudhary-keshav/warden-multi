import type { SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import type { UsageStats, AuxiliaryUsageMap } from '../types/index.js';
import type { AuxiliaryUsageEntry } from './types.js';
/**
 * Extract usage stats from an SDK result message.
 *
 * The Anthropic API reports `input_tokens` as only the non-cached portion.
 * We normalize so that `inputTokens` is the *total* input tokens
 * (non-cached + cache_read + cache_creation), with the cache fields
 * being subsets of that total.
 */
export declare function extractUsage(result: SDKResultMessage): UsageStats;
/**
 * Create empty usage stats.
 */
export declare function emptyUsage(): UsageStats;
/**
 * Aggregate multiple usage stats into one.
 */
export declare function aggregateUsage(usages: UsageStats[]): UsageStats;
/**
 * Aggregate auxiliary usage entries by agent name.
 * Merges multiple entries for the same agent into a single UsageStats.
 * Returns undefined if no entries are provided.
 */
export declare function aggregateAuxiliaryUsage(entries: AuxiliaryUsageEntry[]): AuxiliaryUsageMap | undefined;
/**
 * Merge two AuxiliaryUsageMaps together.
 * Entries for the same agent are summed.
 */
export declare function mergeAuxiliaryUsage(a: AuxiliaryUsageMap | undefined, b: AuxiliaryUsageMap | undefined): AuxiliaryUsageMap | undefined;
/**
 * Estimate token count from character count.
 * Uses chars/4 as a rough approximation for English text.
 */
export declare function estimateTokens(chars: number): number;
//# sourceMappingURL=usage.d.ts.map