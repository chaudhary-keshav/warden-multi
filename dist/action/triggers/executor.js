/**
 * Trigger Executor
 *
 * Executes a single trigger and manages associated GitHub check runs.
 * Extracted from main.ts to enable isolated testing and clearer dependencies.
 */
import { Sentry } from "../../sentry.js";
import { ActionFailedError } from "../workflow/base.js";
import { resolveSkillAsync } from "../../skills/loader.js";
import { filterContextByPaths } from "../../triggers/matcher.js";
import { runSkillTask, createDefaultCallbacks, } from "../../cli/output/tasks.js";
import { renderSkillReport } from "../../output/renderer.js";
import { createSkillCheck, updateSkillCheck, failSkillCheck, } from "../../output/github-checks.js";
import { logGroup, logGroupEnd } from "../workflow/base.js";
import { DEFAULT_FILE_CONCURRENCY } from "../../sdk/types.js";
import { Verbosity } from "../../cli/output/verbosity.js";
/** Log-mode output for CI: no TTY, no color. */
const CI_OUTPUT_MODE = {
    isTTY: false,
    supportsColor: false,
    columns: 120,
};
// -----------------------------------------------------------------------------
// Executor
// -----------------------------------------------------------------------------
/**
 * Execute a single trigger and return results.
 *
 * Handles:
 * - Creating/updating GitHub check runs
 * - Running the skill via Claude Code SDK
 * - Rendering results for GitHub review
 */
export async function executeTrigger(trigger, deps) {
    return Sentry.startSpan({ op: "trigger.execute", name: `execute ${trigger.name}` }, async (span) => {
        span.setAttribute("skill.name", trigger.skill);
        const { octokit, context, config, anthropicApiKey, claudePath, provider, } = deps;
        // Resolve the API key based on the provider
        const resolvedApiKey = anthropicApiKey ||
            process.env["OPENAI_API_KEY"] ||
            process.env["GEMINI_API_KEY"] ||
            "";
        logGroup(`Running trigger: ${trigger.name} (skill: ${trigger.skill})`);
        // Create skill check (only for PRs)
        let skillCheckId;
        let skillCheckUrl;
        if (context.pullRequest) {
            try {
                const skillCheck = await createSkillCheck(octokit, trigger.skill, {
                    owner: context.repository.owner,
                    repo: context.repository.name,
                    headSha: context.pullRequest.headSha,
                });
                skillCheckId = skillCheck.checkRunId;
                skillCheckUrl = skillCheck.url;
            }
            catch (error) {
                console.error(`::warning::Failed to create skill check for ${trigger.skill}: ${error}`);
            }
        }
        const failOn = trigger.failOn ?? deps.globalFailOn;
        const reportOn = trigger.reportOn ?? deps.globalReportOn;
        const minConfidence = trigger.minConfidence ?? "medium";
        const requestChanges = trigger.requestChanges ?? deps.globalRequestChanges;
        const failCheck = trigger.failCheck ?? deps.globalFailCheck;
        try {
            const taskOptions = {
                name: trigger.name,
                displayName: trigger.skill,
                failOn,
                resolveSkill: () => resolveSkillAsync(trigger.skill, context.repoPath, {
                    remote: trigger.remote,
                }),
                context: filterContextByPaths(context, trigger.filters),
                runnerOptions: {
                    apiKey: resolvedApiKey,
                    model: trigger.model,
                    maxTurns: trigger.maxTurns,
                    batchDelayMs: config.defaults?.batchDelayMs,
                    maxContextFiles: config.defaults?.chunking?.maxContextFiles,
                    pathToClaudeCodeExecutable: claudePath,
                    auxiliaryMaxRetries: config.defaults?.auxiliaryMaxRetries,
                    provider,
                    mcpServers: deps.mcpServers,
                },
            };
            const callbacks = createDefaultCallbacks([taskOptions], CI_OUTPUT_MODE, Verbosity.Normal);
            const fileConcurrency = deps.semaphore
                ? Number.MAX_SAFE_INTEGER
                : DEFAULT_FILE_CONCURRENCY;
            const result = await runSkillTask(taskOptions, fileConcurrency, callbacks, deps.semaphore);
            const report = result.report;
            if (!report) {
                throw result.error ?? new Error("Skill task returned no report");
            }
            console.log(`Found ${report.findings.length} findings`);
            // Update skill check with results
            if (skillCheckId && context.pullRequest) {
                try {
                    await updateSkillCheck(octokit, skillCheckId, report, {
                        owner: context.repository.owner,
                        repo: context.repository.name,
                        headSha: context.pullRequest.headSha,
                        failOn,
                        reportOn,
                        minConfidence,
                        failCheck,
                    });
                }
                catch (error) {
                    console.error(`::warning::Failed to update skill check for ${trigger.skill}: ${error}`);
                }
            }
            const maxFindings = trigger.maxFindings ?? deps.globalMaxFindings;
            const renderResult = reportOn !== "off"
                ? renderSkillReport(report, {
                    maxFindings,
                    reportOn,
                    minConfidence,
                    failOn,
                    requestChanges,
                    checkRunUrl: skillCheckUrl,
                    totalFindings: report.findings.length,
                })
                : undefined;
            logGroupEnd();
            return {
                triggerName: trigger.name,
                report,
                renderResult,
                failOn,
                reportOn,
                minConfidence,
                reportOnSuccess: trigger.reportOnSuccess,
                requestChanges,
                failCheck,
                checkRunUrl: skillCheckUrl,
                maxFindings,
            };
        }
        catch (error) {
            if (error instanceof ActionFailedError)
                throw error;
            Sentry.captureException(error, {
                tags: { "trigger.name": trigger.name, "skill.name": trigger.skill },
            });
            // Mark skill check as failed
            if (skillCheckId && context.pullRequest) {
                try {
                    await failSkillCheck(octokit, skillCheckId, error, {
                        owner: context.repository.owner,
                        repo: context.repository.name,
                        headSha: context.pullRequest.headSha,
                    });
                }
                catch (checkError) {
                    console.error(`::warning::Failed to mark skill check as failed: ${checkError}`);
                }
            }
            console.error(`::warning::Trigger ${trigger.name} failed: ${error}`);
            logGroupEnd();
            return { triggerName: trigger.name, error };
        }
    });
}
//# sourceMappingURL=executor.js.map