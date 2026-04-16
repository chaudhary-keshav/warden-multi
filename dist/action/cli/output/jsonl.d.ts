import { z } from 'zod';
import type { SkillReport } from '../../types/index.js';
/**
 * Sentinel value recorded in JSONL metadata when no model is explicitly configured.
 */
export declare const MODEL_DEFAULT_SENTINEL = "(default)";
/**
 * Generate a unique run ID for this execution.
 */
export declare function generateRunId(): string;
/**
 * Get the first 8 hex chars (no dashes) of a UUID for use in filenames.
 */
export declare function shortRunId(runId: string): string;
/**
 * Get the repo-local log file path.
 * Returns: {repoRoot}/.warden/logs/{runId8}-{ISO-datetime}.jsonl
 */
export declare function getRepoLogPath(repoRoot: string, runId: string, timestamp?: Date): string;
/**
 * JSONL record schemas for Warden's structured run output.
 *
 * Formal JSON Schema: specs/jsonl-schema.json
 * Example payloads:   specs/jsonl-examples.jsonl
 * Reporter spec:      specs/reporters.md Section 3 "JSONL Specification"
 */
/** Metadata common to every JSONL record. */
export declare const JsonlRunMetadataSchema: z.ZodObject<{
    timestamp: z.ZodString;
    durationMs: z.ZodNumber;
    cwd: z.ZodString;
    runId: z.ZodString;
    traceId: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
    headSha: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type JsonlRunMetadata = z.infer<typeof JsonlRunMetadataSchema>;
/** Per-file breakdown within a skill record. */
export declare const JsonlFileRecordSchema: z.ZodObject<{
    filename: z.ZodString;
    findings: z.ZodNumber;
    durationMs: z.ZodOptional<z.ZodNumber>;
    usage: z.ZodOptional<z.ZodObject<{
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cacheReadInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheCreationInputTokens: z.ZodOptional<z.ZodNumber>;
        costUSD: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type JsonlFileRecord = z.infer<typeof JsonlFileRecordSchema>;
/** One skill's analysis results. */
export declare const JsonlRecordSchema: z.ZodObject<{
    run: z.ZodObject<{
        timestamp: z.ZodString;
        durationMs: z.ZodNumber;
        cwd: z.ZodString;
        runId: z.ZodString;
        traceId: z.ZodOptional<z.ZodString>;
        model: z.ZodOptional<z.ZodString>;
        headSha: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    skill: z.ZodString;
    summary: z.ZodString;
    findings: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        severity: z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodEnum<{
            high: "high";
            medium: "medium";
            low: "low";
        }>>;
        confidence: z.ZodOptional<z.ZodEnum<{
            high: "high";
            medium: "medium";
            low: "low";
        }>>;
        title: z.ZodString;
        description: z.ZodString;
        verification: z.ZodOptional<z.ZodString>;
        location: z.ZodOptional<z.ZodObject<{
            path: z.ZodString;
            startLine: z.ZodNumber;
            endLine: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        additionalLocations: z.ZodOptional<z.ZodArray<z.ZodObject<{
            path: z.ZodString;
            startLine: z.ZodNumber;
            endLine: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>>;
        suggestedFix: z.ZodOptional<z.ZodObject<{
            description: z.ZodString;
            diff: z.ZodString;
        }, z.core.$strip>>;
        elapsedMs: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    model: z.ZodOptional<z.ZodString>;
    durationMs: z.ZodOptional<z.ZodNumber>;
    usage: z.ZodOptional<z.ZodObject<{
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cacheReadInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheCreationInputTokens: z.ZodOptional<z.ZodNumber>;
        costUSD: z.ZodNumber;
    }, z.core.$strip>>;
    auxiliaryUsage: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cacheReadInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheCreationInputTokens: z.ZodOptional<z.ZodNumber>;
        costUSD: z.ZodNumber;
    }, z.core.$strip>>>;
    files: z.ZodOptional<z.ZodArray<z.ZodObject<{
        filename: z.ZodString;
        findings: z.ZodNumber;
        durationMs: z.ZodOptional<z.ZodNumber>;
        usage: z.ZodOptional<z.ZodObject<{
            inputTokens: z.ZodNumber;
            outputTokens: z.ZodNumber;
            cacheReadInputTokens: z.ZodOptional<z.ZodNumber>;
            cacheCreationInputTokens: z.ZodOptional<z.ZodNumber>;
            costUSD: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>>>;
    skippedFiles: z.ZodOptional<z.ZodArray<z.ZodObject<{
        filename: z.ZodString;
        reason: z.ZodEnum<{
            pattern: "pattern";
            builtin: "builtin";
        }>;
        pattern: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    failedHunks: z.ZodOptional<z.ZodNumber>;
    failedExtractions: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type JsonlRecord = z.infer<typeof JsonlRecordSchema>;
/** Aggregate summary across all skills (always the last JSONL line). */
export declare const JsonlSummaryRecordSchema: z.ZodObject<{
    run: z.ZodObject<{
        timestamp: z.ZodString;
        durationMs: z.ZodNumber;
        cwd: z.ZodString;
        runId: z.ZodString;
        traceId: z.ZodOptional<z.ZodString>;
        model: z.ZodOptional<z.ZodString>;
        headSha: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    type: z.ZodLiteral<"summary">;
    totalFindings: z.ZodNumber;
    bySeverity: z.ZodPipe<z.ZodRecord<z.ZodString, z.ZodNumber>, z.ZodTransform<Record<"high" | "medium" | "low", number>, Record<string, number>>>;
    usage: z.ZodOptional<z.ZodObject<{
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cacheReadInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheCreationInputTokens: z.ZodOptional<z.ZodNumber>;
        costUSD: z.ZodNumber;
    }, z.core.$strip>>;
    totalSkippedFiles: z.ZodOptional<z.ZodNumber>;
    auxiliaryUsage: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cacheReadInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheCreationInputTokens: z.ZodOptional<z.ZodNumber>;
        costUSD: z.ZodNumber;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type JsonlSummaryRecord = z.infer<typeof JsonlSummaryRecordSchema>;
/** Per-evaluation detail for fix evaluation records. */
export declare const JsonlFixEvalDetailSchema: z.ZodObject<{
    path: z.ZodString;
    line: z.ZodNumber;
    findingId: z.ZodOptional<z.ZodString>;
    verdict: z.ZodUnion<readonly [z.ZodEnum<{
        not_attempted: "not_attempted";
        attempted_failed: "attempted_failed";
        resolved: "resolved";
    }>, z.ZodLiteral<"re_detected">]>;
    reasoning: z.ZodOptional<z.ZodString>;
    durationMs: z.ZodNumber;
    usage: z.ZodObject<{
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cacheReadInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheCreationInputTokens: z.ZodOptional<z.ZodNumber>;
        costUSD: z.ZodNumber;
    }, z.core.$strip>;
}, z.core.$strip>;
export type JsonlFixEvalDetail = z.infer<typeof JsonlFixEvalDetailSchema>;
/** Fix evaluation results record. */
export declare const JsonlFixEvaluationRecordSchema: z.ZodObject<{
    run: z.ZodObject<{
        timestamp: z.ZodString;
        durationMs: z.ZodNumber;
        cwd: z.ZodString;
        runId: z.ZodString;
        traceId: z.ZodOptional<z.ZodString>;
        model: z.ZodOptional<z.ZodString>;
        headSha: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    type: z.ZodLiteral<"fix-evaluation">;
    evaluated: z.ZodNumber;
    resolved: z.ZodNumber;
    needsAttention: z.ZodNumber;
    skipped: z.ZodNumber;
    failedEvaluations: z.ZodNumber;
    usage: z.ZodOptional<z.ZodObject<{
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cacheReadInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheCreationInputTokens: z.ZodOptional<z.ZodNumber>;
        costUSD: z.ZodNumber;
    }, z.core.$strip>>;
    evaluations: z.ZodOptional<z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        line: z.ZodNumber;
        findingId: z.ZodOptional<z.ZodString>;
        verdict: z.ZodUnion<readonly [z.ZodEnum<{
            not_attempted: "not_attempted";
            attempted_failed: "attempted_failed";
            resolved: "resolved";
        }>, z.ZodLiteral<"re_detected">]>;
        reasoning: z.ZodOptional<z.ZodString>;
        durationMs: z.ZodNumber;
        usage: z.ZodObject<{
            inputTokens: z.ZodNumber;
            outputTokens: z.ZodNumber;
            cacheReadInputTokens: z.ZodOptional<z.ZodNumber>;
            cacheCreationInputTokens: z.ZodOptional<z.ZodNumber>;
            costUSD: z.ZodNumber;
        }, z.core.$strip>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type JsonlFixEvaluationRecord = z.infer<typeof JsonlFixEvaluationRecordSchema>;
/**
 * Render skill reports as a JSONL string.
 * Each line contains one skill report with run metadata.
 * A final summary line is appended at the end.
 */
export declare function renderJsonlString(reports: SkillReport[], durationMs: number, options?: {
    runId?: string;
    traceId?: string;
    timestamp?: Date;
    model?: string;
    headSha?: string;
    cwd?: string;
}): string;
/**
 * Write skill reports to a JSONL file.
 */
export declare function writeJsonlReport(outputPath: string, reports: SkillReport[], durationMs: number, options?: {
    runId?: string;
    traceId?: string;
}): void;
/**
 * Write pre-rendered JSONL content to a file path.
 */
export declare function writeJsonlContent(outputPath: string, content: string): void;
/**
 * Read a JSONL log file and return its contents.
 */
export declare function readJsonlLog(logPath: string): string;
/**
 * Parse JSONL content and reconstruct SkillReport objects.
 * Returns an object with the reports array, run metadata from the summary,
 * and total duration.
 */
export interface ParsedJsonlLog {
    reports: SkillReport[];
    runMetadata?: JsonlRunMetadata;
    totalDurationMs: number;
}
export declare function parseJsonlReports(content: string): ParsedJsonlLog;
/**
 * Lightweight metadata extracted from a JSONL log file.
 * Includes the summary record plus skill names from the skill records.
 */
export interface LogFileMetadata {
    summary: JsonlSummaryRecord;
    skills: string[];
    model?: string;
    headSha?: string;
    totalFiles: number;
}
/**
 * Parse a JSONL log file for its summary and skill names.
 * Reads all lines but only fully parses the summary; extracts skill names
 * from non-summary lines with minimal parsing.
 */
export declare function parseLogMetadata(filePath: string): LogFileMetadata | undefined;
//# sourceMappingURL=jsonl.d.ts.map