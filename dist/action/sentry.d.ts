import * as Sentry from '@sentry/node';
import type { SkillReport } from './types/index.js';
export type SentryContext = 'cli' | 'action';
export declare function initSentry(context: SentryContext): void;
export { Sentry };
export declare const logger: typeof Sentry.logger;
/**
 * Set attributes on the global Sentry scope.
 * These automatically apply to ALL metrics and spans.
 */
export declare function setGlobalAttributes(attrs: Record<string, string | number | boolean>): void;
/**
 * Get the trace ID from the active span, if available.
 * Useful for correlating runs to Sentry traces in logs and output.
 */
export declare function getTraceId(): string | undefined;
/**
 * Emit a single run count. Call once per analysis workflow execution.
 * Inherits warden.source and warden.repository from global scope.
 */
export declare function emitRunMetric(): void;
export declare function emitSkillMetrics(report: SkillReport): void;
export declare function emitExtractionMetrics(skill: string, method: 'regex' | 'llm' | 'none', count: number): void;
export declare function emitFixEvalMetrics(evaluated: number, resolved: number, failed: number, skipped: number, uniqueFindingsEvaluated: number, uniqueFindingsCodeChanged: number, uniqueFindingsResolved: number): void;
export declare function emitFixGateMetrics(skill: string, checked: number, strippedDeterministic: number, strippedSemantic: number, semanticUnavailable: number): void;
export declare function emitRetryMetric(skill: string, attempt: number): void;
export declare function emitDedupMetrics(skill: string, total: number, unique: number): void;
export declare function emitFixEvalVerdictMetric(verdict: string, skill?: string): void;
export declare function emitStaleResolutionMetric(count: number, skill?: string): void;
/**
 * Flush pending Sentry events. Safe to call even if Sentry is not initialized.
 */
export declare function flushSentry(timeoutMs?: number): Promise<void>;
