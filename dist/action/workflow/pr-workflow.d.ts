/**
 * PR Workflow
 *
 * Handles pull_request and push events.
 */
import type { Octokit } from '@octokit/rest';
import type { ActionInputs } from '../inputs.js';
export declare function runPRWorkflow(octokit: Octokit, inputs: ActionInputs, eventName: string, eventPath: string, repoPath: string): Promise<void>;
//# sourceMappingURL=pr-workflow.d.ts.map