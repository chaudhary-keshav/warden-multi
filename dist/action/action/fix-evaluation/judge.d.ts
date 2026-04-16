import type { Octokit } from '@octokit/rest';
import type { ExistingComment } from '../../output/dedup.js';
import type { FixJudgeResult } from './types.js';
export interface FixJudgeInput {
    comment: ExistingComment;
    changedFiles: string[];
    codeBeforeFix: string;
    codeAfterFix?: string;
    commitMessages?: string[];
}
export interface FixJudgeContext {
    octokit: Octokit;
    owner: string;
    repo: string;
    baseSha: string;
    headSha: string;
    patches: Map<string, string>;
}
/**
 * Evaluate whether a code change fixed a reported issue.
 * Uses Haiku with tool use to explore the changes.
 */
export declare function evaluateFix(input: FixJudgeInput, context: FixJudgeContext, apiKey: string, maxRetries?: number): Promise<FixJudgeResult>;
//# sourceMappingURL=judge.d.ts.map