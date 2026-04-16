/**
 * GitHub Action Entry Point
 *
 * Thin orchestrator that routes events to the appropriate workflow handler.
 *
 * Error Handling Policy
 * =====================
 *
 * Fatal errors (setFailed - exit immediately):
 * - Missing required inputs (API key, GitHub token, environment variables)
 * - Environment setup failures (not running in GitHub Actions)
 * - Claude Code CLI not found
 * - Event payload parsing failures
 * - Event context building failures
 *
 * Non-fatal errors (log warning + continue):
 * - Individual trigger execution failures (accumulate and report)
 * - GitHub check creation/update failures
 * - Review comment posting failures
 * - Stale comment resolution failures
 *
 * End-of-run failure conditions:
 * - Findings exceed severity threshold (fail-on)
 * - ALL triggers failed (no successful analysis)
 */
export {};
//# sourceMappingURL=main.d.ts.map