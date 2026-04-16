/**
 * Workflow Base
 *
 * Shared infrastructure for PR and schedule workflows.
 */
import type { Octokit } from '@octokit/rest';
import type { EventContext, SkillReport } from '../../types/index.js';
import type { TriggerResult } from '../triggers/executor.js';
/**
 * Sentinel error thrown by setFailed() so the top-level catch handler
 * can distinguish expected failures from unexpected crashes.
 */
export declare class ActionFailedError extends Error {
    constructor(message: string);
}
/**
 * Set a GitHub Actions output variable.
 */
export declare function setOutput(name: string, value: string | number): void;
/**
 * Fail the GitHub Action with an error message.
 * Throws ActionFailedError so spans end cleanly before the process exits.
 */
export declare function setFailed(message: string): never;
/**
 * Start a collapsible log group.
 */
export declare function logGroup(name: string): void;
/**
 * End a collapsible log group.
 */
export declare function logGroupEnd(): void;
/**
 * Find the Claude Code CLI executable path.
 * Required in CI environments where the SDK can't auto-detect the CLI location.
 */
export declare function findClaudeCodeExecutable(): Promise<string>;
/**
 * Log trigger error summary and fail if all triggers failed.
 */
export declare function handleTriggerErrors(triggerErrors: string[], totalTriggers: number): void;
/**
 * Collect error messages from trigger results.
 */
export declare function collectTriggerErrors(results: TriggerResult[]): string[];
export interface WorkflowOutputs {
    findingsCount: number;
    highCount: number;
    summary: string;
}
/**
 * Compute workflow outputs from reports.
 */
export declare function computeWorkflowOutputs(reports: SkillReport[]): WorkflowOutputs;
/**
 * Set workflow output variables.
 */
export declare function setWorkflowOutputs(outputs: WorkflowOutputs): void;
/**
 * Get the authenticated bot's login name.
 *
 * Tries three strategies in order:
 * 1. GraphQL `viewer` query (works for both installation tokens and PATs)
 * 2. `octokit.apps.getAuthenticated()` → `${slug}[bot]` (GitHub App JWT fallback)
 * 3. `octokit.users.getAuthenticated()` (PAT fallback)
 */
export declare function getAuthenticatedBotLogin(octokit: Octokit): Promise<string | null>;
/**
 * Get the default branch for a repository from the GitHub API.
 */
export declare function getDefaultBranchFromAPI(octokit: Octokit, owner: string, repo: string): Promise<string>;
/**
 * Get the path for the findings output file.
 * Uses RUNNER_TEMP (GitHub Actions) with fallback to OS temp dir.
 */
export declare function getFindingsOutputPath(): string;
/**
 * Write structured findings data to a JSON file for external export (GCS, S3, etc.).
 *
 * Always writes to a known location under RUNNER_TEMP and sets the `findings-file`
 * output so downstream steps can reference the path.
 */
export declare function writeFindingsOutput(reports: SkillReport[], context: EventContext): string;
//# sourceMappingURL=base.d.ts.map