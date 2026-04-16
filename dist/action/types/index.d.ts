import { z } from 'zod';
/**
 * Normalize legacy severity values to the 3-level scale.
 * Maps 'critical' → 'high' and 'info' → 'low' for backwards compatibility
 * with old JSONL logs and LLM responses.
 */
export declare function normalizeSeverity(val: unknown): unknown;
export declare const SeveritySchema: z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodEnum<{
    high: "high";
    medium: "medium";
    low: "low";
}>>;
export type Severity = z.infer<typeof SeveritySchema>;
export declare const ConfidenceSchema: z.ZodEnum<{
    high: "high";
    medium: "medium";
    low: "low";
}>;
export type Confidence = z.infer<typeof ConfidenceSchema>;
/**
 * Confidence order for comparison (lower = more confident).
 * Single source of truth for confidence ordering across the codebase.
 */
export declare const CONFIDENCE_ORDER: Record<Confidence, number>;
export declare const SeverityThresholdSchema: z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodEnum<{
    high: "high";
    medium: "medium";
    low: "low";
    off: "off";
}>>;
export type SeverityThreshold = z.infer<typeof SeverityThresholdSchema>;
export declare const ConfidenceThresholdSchema: z.ZodEnum<{
    high: "high";
    medium: "medium";
    low: "low";
    off: "off";
}>;
export type ConfidenceThreshold = z.infer<typeof ConfidenceThresholdSchema>;
/**
 * Severity order for comparison (lower = more severe).
 * Single source of truth for severity ordering across the codebase.
 */
export declare const SEVERITY_ORDER: Record<Severity, number>;
/**
 * Filter findings to only include those at or above the given severity threshold.
 * If no threshold is provided, returns all findings unchanged.
 * If threshold is 'off', returns empty array (disabled).
 */
export declare function filterFindingsBySeverity(findings: Finding[], threshold?: SeverityThreshold): Finding[];
/**
 * Filter findings to only include those at or above the given confidence threshold.
 * If no threshold is provided or threshold is 'off', returns all findings unchanged.
 * Findings without a confidence field are always included (backwards compat).
 */
export declare function filterFindingsByConfidence(findings: Finding[], threshold?: ConfidenceThreshold): Finding[];
/**
 * Filter findings by both severity and confidence thresholds.
 * Applies severity filtering first, then confidence filtering.
 * Either threshold can be omitted to skip that filter.
 */
export declare function filterFindings(findings: Finding[], reportOn?: SeverityThreshold, minConfidence?: ConfidenceThreshold): Finding[];
export declare const LocationSchema: z.ZodObject<{
    path: z.ZodString;
    startLine: z.ZodNumber;
    endLine: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type Location = z.infer<typeof LocationSchema>;
export declare const SuggestedFixSchema: z.ZodObject<{
    description: z.ZodString;
    diff: z.ZodString;
}, z.core.$strip>;
export type SuggestedFix = z.infer<typeof SuggestedFixSchema>;
export declare const FindingSchema: z.ZodObject<{
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
}, z.core.$strip>;
export type Finding = z.infer<typeof FindingSchema>;
/**
 * Get the effective line number for a finding (endLine if present, otherwise startLine).
 */
export declare function findingLine(f: Finding): number;
/**
 * Compare two findings by priority for winner selection.
 * Lower return value = higher priority (more severe, more confident, earlier path/line).
 */
export declare function compareFindingPriority(a: Finding, b: Finding): number;
export declare const UsageStatsSchema: z.ZodObject<{
    inputTokens: z.ZodNumber;
    outputTokens: z.ZodNumber;
    cacheReadInputTokens: z.ZodOptional<z.ZodNumber>;
    cacheCreationInputTokens: z.ZodOptional<z.ZodNumber>;
    costUSD: z.ZodNumber;
}, z.core.$strip>;
export type UsageStats = z.infer<typeof UsageStatsSchema>;
export declare const AuxiliaryUsageMapSchema: z.ZodRecord<z.ZodString, z.ZodObject<{
    inputTokens: z.ZodNumber;
    outputTokens: z.ZodNumber;
    cacheReadInputTokens: z.ZodOptional<z.ZodNumber>;
    cacheCreationInputTokens: z.ZodOptional<z.ZodNumber>;
    costUSD: z.ZodNumber;
}, z.core.$strip>>;
export type AuxiliaryUsageMap = z.infer<typeof AuxiliaryUsageMapSchema>;
export declare const SkippedFileSchema: z.ZodObject<{
    filename: z.ZodString;
    reason: z.ZodEnum<{
        pattern: "pattern";
        builtin: "builtin";
    }>;
    pattern: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type SkippedFile = z.infer<typeof SkippedFileSchema>;
export declare const FileReportSchema: z.ZodObject<{
    filename: z.ZodString;
    findingCount: z.ZodNumber;
    durationMs: z.ZodOptional<z.ZodNumber>;
    usage: z.ZodOptional<z.ZodObject<{
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cacheReadInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheCreationInputTokens: z.ZodOptional<z.ZodNumber>;
        costUSD: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type FileReport = z.infer<typeof FileReportSchema>;
export declare const SkillReportSchema: z.ZodObject<{
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
    durationMs: z.ZodOptional<z.ZodNumber>;
    usage: z.ZodOptional<z.ZodObject<{
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cacheReadInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheCreationInputTokens: z.ZodOptional<z.ZodNumber>;
        costUSD: z.ZodNumber;
    }, z.core.$strip>>;
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
    auxiliaryUsage: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        cacheReadInputTokens: z.ZodOptional<z.ZodNumber>;
        cacheCreationInputTokens: z.ZodOptional<z.ZodNumber>;
        costUSD: z.ZodNumber;
    }, z.core.$strip>>>;
    files: z.ZodOptional<z.ZodArray<z.ZodObject<{
        filename: z.ZodString;
        findingCount: z.ZodNumber;
        durationMs: z.ZodOptional<z.ZodNumber>;
        usage: z.ZodOptional<z.ZodObject<{
            inputTokens: z.ZodNumber;
            outputTokens: z.ZodNumber;
            cacheReadInputTokens: z.ZodOptional<z.ZodNumber>;
            cacheCreationInputTokens: z.ZodOptional<z.ZodNumber>;
            costUSD: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strip>>>;
    model: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type SkillReport = z.infer<typeof SkillReportSchema>;
export declare const GitHubEventTypeSchema: z.ZodEnum<{
    schedule: "schedule";
    pull_request: "pull_request";
    issues: "issues";
    issue_comment: "issue_comment";
    pull_request_review: "pull_request_review";
    pull_request_review_comment: "pull_request_review_comment";
}>;
export type GitHubEventType = z.infer<typeof GitHubEventTypeSchema>;
export declare const PullRequestActionSchema: z.ZodEnum<{
    opened: "opened";
    synchronize: "synchronize";
    reopened: "reopened";
    closed: "closed";
}>;
export type PullRequestAction = z.infer<typeof PullRequestActionSchema>;
export declare const FileChangeSchema: z.ZodObject<{
    filename: z.ZodString;
    status: z.ZodEnum<{
        added: "added";
        removed: "removed";
        modified: "modified";
        renamed: "renamed";
        copied: "copied";
        changed: "changed";
        unchanged: "unchanged";
    }>;
    additions: z.ZodNumber;
    deletions: z.ZodNumber;
    patch: z.ZodOptional<z.ZodString>;
    chunks: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type FileChange = z.infer<typeof FileChangeSchema>;
/**
 * Count the number of chunks/hunks in a patch string.
 * Each chunk starts with @@ -X,Y +A,B @@
 */
export declare function countPatchChunks(patch: string | undefined): number;
export declare const PullRequestContextSchema: z.ZodObject<{
    number: z.ZodNumber;
    title: z.ZodString;
    body: z.ZodNullable<z.ZodString>;
    author: z.ZodString;
    baseBranch: z.ZodString;
    headBranch: z.ZodString;
    headSha: z.ZodString;
    baseSha: z.ZodString;
    files: z.ZodArray<z.ZodObject<{
        filename: z.ZodString;
        status: z.ZodEnum<{
            added: "added";
            removed: "removed";
            modified: "modified";
            renamed: "renamed";
            copied: "copied";
            changed: "changed";
            unchanged: "unchanged";
        }>;
        additions: z.ZodNumber;
        deletions: z.ZodNumber;
        patch: z.ZodOptional<z.ZodString>;
        chunks: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type PullRequestContext = z.infer<typeof PullRequestContextSchema>;
export declare const RepositoryContextSchema: z.ZodObject<{
    owner: z.ZodString;
    name: z.ZodString;
    fullName: z.ZodString;
    defaultBranch: z.ZodString;
}, z.core.$strip>;
export type RepositoryContext = z.infer<typeof RepositoryContextSchema>;
export declare const EventContextSchema: z.ZodObject<{
    eventType: z.ZodEnum<{
        schedule: "schedule";
        pull_request: "pull_request";
        issues: "issues";
        issue_comment: "issue_comment";
        pull_request_review: "pull_request_review";
        pull_request_review_comment: "pull_request_review_comment";
    }>;
    action: z.ZodString;
    repository: z.ZodObject<{
        owner: z.ZodString;
        name: z.ZodString;
        fullName: z.ZodString;
        defaultBranch: z.ZodString;
    }, z.core.$strip>;
    pullRequest: z.ZodOptional<z.ZodObject<{
        number: z.ZodNumber;
        title: z.ZodString;
        body: z.ZodNullable<z.ZodString>;
        author: z.ZodString;
        baseBranch: z.ZodString;
        headBranch: z.ZodString;
        headSha: z.ZodString;
        baseSha: z.ZodString;
        files: z.ZodArray<z.ZodObject<{
            filename: z.ZodString;
            status: z.ZodEnum<{
                added: "added";
                removed: "removed";
                modified: "modified";
                renamed: "renamed";
                copied: "copied";
                changed: "changed";
                unchanged: "unchanged";
            }>;
            additions: z.ZodNumber;
            deletions: z.ZodNumber;
            patch: z.ZodOptional<z.ZodString>;
            chunks: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    repoPath: z.ZodString;
}, z.core.$strip>;
export type EventContext = z.infer<typeof EventContextSchema>;
export declare const FixStatusSchema: z.ZodEnum<{
    not_attempted: "not_attempted";
    attempted_failed: "attempted_failed";
    resolved: "resolved";
}>;
export type FixStatus = z.infer<typeof FixStatusSchema>;
export declare const RetryConfigSchema: z.ZodObject<{
    maxRetries: z.ZodDefault<z.ZodNumber>;
    initialDelayMs: z.ZodDefault<z.ZodNumber>;
    backoffMultiplier: z.ZodDefault<z.ZodNumber>;
    maxDelayMs: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type RetryConfig = z.infer<typeof RetryConfigSchema>;
//# sourceMappingURL=index.d.ts.map