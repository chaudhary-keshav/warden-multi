import type { Octokit } from '@octokit/rest';
import type { Finding, UsageStats } from '../types/index.js';
/**
 * Parsed marker data from a Warden comment.
 */
export interface WardenMarker {
    path: string;
    line: number;
    contentHash: string;
}
/**
 * Existing comment from GitHub (either Warden or external).
 */
export interface ExistingComment {
    id: number;
    path: string;
    line: number;
    title: string;
    description: string;
    contentHash: string;
    /** GraphQL node ID for the review thread (used to resolve stale comments) */
    threadId?: string;
    /** Whether the thread has been resolved (resolved comments are used for dedup but not stale detection) */
    isResolved?: boolean;
    /** Whether this is a Warden-generated comment */
    isWarden?: boolean;
    /** Skills that have already detected this issue (for Warden comments) */
    skills?: string[];
    /** The raw comment body (needed for updating Warden comments) */
    body?: string;
    /** GraphQL node ID for the comment (needed for adding reactions) */
    commentNodeId?: string;
}
/**
 * Type of action to take for a duplicate finding.
 */
export type DuplicateActionType = 'update_warden' | 'react_external';
/**
 * Action to take for a duplicate finding.
 */
export interface DuplicateAction {
    type: DuplicateActionType;
    finding: Finding;
    existingComment: ExistingComment;
    /** Whether this was a hash match or semantic match */
    matchType: 'hash' | 'semantic';
}
/**
 * Result of deduplication with actions for duplicates.
 */
export interface DeduplicateResult {
    /** Findings that are not duplicates - should be posted */
    newFindings: Finding[];
    /** Actions to take for duplicate findings */
    duplicateActions: DuplicateAction[];
    /** Usage from semantic dedup LLM call, if invoked */
    dedupUsage?: UsageStats;
}
/**
 * Generate a short content hash from title and description.
 * Used for exact-match deduplication.
 */
export declare function generateContentHash(title: string, description: string): string;
/**
 * Generate the marker HTML comment to embed in comment body.
 * Format: <!-- warden:v1:{path}:{line}:{contentHash} -->
 */
export declare function generateMarker(path: string, line: number, contentHash: string): string;
/**
 * Parse a Warden marker from a comment body.
 * Returns null if no valid marker is found.
 */
export declare function parseMarker(body: string): WardenMarker | null;
/**
 * Parse title and description from a Warden comment body.
 * Expected format: **:emoji: Title**\n\nDescription or **Title**\n\nDescription
 * Strips legacy [ID] prefix from titles for backward compat.
 */
export declare function parseWardenComment(body: string): {
    title: string;
    description: string;
} | null;
/**
 * Check if a comment body is a Warden-generated comment.
 * Supports current format (Identified by Warden `skill`), and legacy formats:
 * bracket (<sub>Identified by Warden [skill]</sub>), via (<sub>Identified by Warden via `skill`</sub>),
 * old (<sub>warden: skill</sub>).
 */
export declare function isWardenComment(body: string): boolean;
/**
 * Parse skill names from a Warden comment's attribution line.
 * Supports four formats:
 * - Current: "Identified by Warden `skill1`, `skill2` · id"
 * - Legacy bracket: "<sub>Identified by Warden [skill1], [skill2] · id</sub>"
 * - Legacy via: "<sub>Identified by Warden via `skill1`, `skill2` · severity</sub>"
 * - Legacy old: "<sub>warden: skill1, skill2</sub>"
 */
export declare function parseWardenSkills(body: string): string[];
/**
 * Update a Warden comment body to add a new skill to the attribution.
 * Current format: Changes "Identified by Warden `skill1` · id"
 *                 to "Identified by Warden `skill1`, `skill2` · id"
 * Legacy bracket: Changes "<sub>Identified by Warden [skill1] · id</sub>"
 *                 to "<sub>Identified by Warden [skill1], [skill2] · id</sub>"
 * Legacy via: Changes "<sub>Identified by Warden via `skill1` · severity</sub>"
 *             to "<sub>Identified by Warden via `skill1`, `skill2` · severity</sub>"
 * Legacy old: Changes "<sub>warden: skill1</sub>" to "<sub>warden: skill1, skill2</sub>"
 * Returns null if skill is already listed or if no attribution tag exists.
 */
export declare function updateWardenCommentBody(body: string, newSkill: string): string | null;
/**
 * Fetch all existing review comments for a PR (both Warden and external).
 * Uses GraphQL to get thread IDs for stale comment resolution and node IDs for reactions.
 */
export declare function fetchExistingComments(octokit: Octokit, owner: string, repo: string, prNumber: number): Promise<ExistingComment[]>;
/**
 * @deprecated Use fetchExistingComments instead
 */
export declare function fetchExistingWardenComments(octokit: Octokit, owner: string, repo: string, prNumber: number): Promise<ExistingComment[]>;
/**
 * Options for deduplication.
 */
export interface DeduplicateOptions {
    /** Anthropic API key for LLM-based semantic deduplication */
    apiKey?: string;
    /** Skip LLM deduplication and only use exact hash matching */
    hashOnly?: boolean;
    /** Current skill name (for updating Warden comment attribution) */
    currentSkill?: string;
    /** Max retries for auxiliary Haiku calls */
    maxRetries?: number;
}
/**
 * Update an existing Warden PR review comment via REST API.
 */
export declare function updateWardenComment(octokit: Octokit, owner: string, repo: string, commentId: number, newBody: string): Promise<void>;
/**
 * Add a reaction to an existing PR review comment.
 * Uses GraphQL to handle review comments.
 */
export declare function addReactionToComment(octokit: Octokit, commentNodeId: string, reaction?: 'THUMBS_UP' | 'EYES'): Promise<void>;
/**
 * Process duplicate actions - update Warden comments and add reactions.
 * Returns counts of actions taken for logging.
 */
export declare function processDuplicateActions(octokit: Octokit, owner: string, repo: string, actions: DuplicateAction[], currentSkill: string): Promise<{
    updated: number;
    reacted: number;
    skipped: number;
    failed: number;
}>;
/**
 * Convert a Finding to an ExistingComment for cross-trigger deduplication.
 * Returns null if the finding has no location.
 */
export declare function findingToExistingComment(finding: Finding, skill?: string): ExistingComment | null;
/**
 * Result from consolidating findings within a single batch.
 */
export interface ConsolidateResult {
    findings: Finding[];
    removedCount: number;
    usage?: UsageStats;
}
/**
 * Consolidate findings within a single batch to remove duplicates that describe
 * the same root cause. Three-phase approach:
 *
 * 1. Hash dedup: remove exact duplicates (same path:line:contentHash)
 * 2. Proximity grouping: identify clusters of findings within 5 lines of each other
 * 3. LLM consolidation: ask Haiku to group findings by root cause (only when proximity matches exist)
 *
 * For each group, keeps the highest-severity finding.
 */
export declare function consolidateBatchFindings(findings: Finding[], options?: {
    apiKey?: string;
    hashOnly?: boolean;
    maxRetries?: number;
}): Promise<ConsolidateResult>;
/**
 * Deduplicate findings against existing comments.
 * Returns non-duplicate findings and actions to take for duplicates.
 *
 * Deduplication is two-pass:
 * 1. Exact content hash match - instant match
 * 2. LLM semantic comparison for remaining findings (if API key provided)
 *
 * For duplicates:
 * - If matching a Warden comment: action to update attribution with new skill
 * - If matching an external comment: action to add reaction
 */
export declare function deduplicateFindings(findings: Finding[], existingComments: ExistingComment[], options?: DeduplicateOptions): Promise<DeduplicateResult>;
//# sourceMappingURL=dedup.d.ts.map