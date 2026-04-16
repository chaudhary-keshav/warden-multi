import type { Finding, UsageStats } from '../types/index.js';
/** Pattern to match the start of findings JSON (allows whitespace after brace) */
export declare const FINDINGS_JSON_START: RegExp;
/**
 * Result from extracting findings JSON from text.
 */
export type ExtractFindingsResult = {
    success: true;
    findings: unknown[];
    usage?: UsageStats;
} | {
    success: false;
    error: string;
    preview: string;
    usage?: UsageStats;
};
/**
 * Extract JSON object from text, handling nested braces correctly.
 * Starts from the given position and returns the balanced JSON object.
 */
export declare function extractBalancedJson(text: string, startIndex: number): string | null;
/**
 * Extract findings JSON from model output text.
 * Handles markdown code fences, prose before JSON, and nested objects.
 */
export declare function extractFindingsJson(rawText: string): ExtractFindingsResult;
/**
 * Truncate text for LLM fallback while preserving the findings JSON.
 *
 * Caller must ensure findings JSON exists in the text before calling.
 */
export declare function truncateForLLMFallback(rawText: string, maxChars: number): string;
/**
 * Extract findings from malformed output using LLM as a fallback.
 * Uses Haiku for lightweight, fast extraction.
 */
export declare function extractFindingsWithLLM(rawText: string, apiKey?: string, maxRetries?: number): Promise<ExtractFindingsResult>;
/** Length of each generated short ID (before formatting). */
export declare const SHORT_ID_LENGTH = 6;
/**
 * Generate a short human-readable ID for a finding.
 * Format: XXX-XXX (e.g., K7M-X9P)
 */
export declare function generateShortId(): string;
/**
 * Validate and normalize findings from extracted JSON.
 * Replaces the LLM-provided ID with a short nanoid for stable cross-referencing.
 */
export declare function validateFindings(findings: unknown[], filename: string): Finding[];
/**
 * Deduplicate findings by title and location.
 */
export declare function deduplicateFindings(findings: Finding[]): Finding[];
/**
 * Merge locations from loser findings into the winner.
 * Each loser's primary location and any existing additionalLocations are
 * appended to winner.additionalLocations (deduplicated).
 *
 * @param sortedGroup - Findings sorted by priority (winner first, losers after).
 * @returns A shallow copy of the winner with merged locations, or undefined if empty.
 */
export declare function mergeGroupLocations(sortedGroup: Finding[]): Finding | undefined;
/**
 * Result of applying merge groups to a list of findings.
 */
interface ApplyGroupsResult {
    /** Original findings that were absorbed into another finding's additionalLocations */
    absorbed: Set<Finding>;
    /** Map from original winner finding to its merged replacement (with additionalLocations) */
    replacements: Map<Finding, Finding>;
}
/**
 * Apply LLM-returned merge groups to a list of findings.
 *
 * For each group, the highest-priority finding becomes the winner, and all
 * other findings' locations are folded into its additionalLocations.
 * Handles overlapping groups by substituting prior replacements and tracking
 * absorbed findings by their original identity.
 *
 * @param indexedFindings - The findings referenced by the 1-based group indices.
 * @param groups - Arrays of 1-based indices grouping findings by shared root cause.
 */
export declare function applyMergeGroups(indexedFindings: Finding[], groups: number[][]): ApplyGroupsResult;
/**
 * Result from merging cross-location findings.
 */
export interface MergeResult {
    findings: Finding[];
    mergedCount: number;
    usage?: UsageStats;
}
/**
 * Merge findings that describe the same issue across different code locations.
 *
 * Uses Haiku to identify groups of findings about the same root cause at
 * different locations. For each group, the highest-priority finding becomes
 * the primary; other locations move to `additionalLocations`.
 *
 * Skips entirely (no LLM call) when:
 * - Fewer than 2 findings have locations
 * - No API key is provided
 */
export declare function mergeCrossLocationFindings(findings: Finding[], options?: {
    apiKey?: string;
    repoPath?: string;
    maxRetries?: number;
}): Promise<MergeResult>;
export {};
//# sourceMappingURL=extract.d.ts.map