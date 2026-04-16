import { z } from 'zod';
import type { SkillReport, UsageStats } from '../types/index.js';
/** Default model for eval skill execution and judging. */
export declare const DEFAULT_EVAL_MODEL = "claude-sonnet-4-6";
/**
 * A "should find" assertion in BDD style.
 */
export declare const ShouldFindSchema: z.ZodObject<{
    finding: z.ZodString;
    severity: z.ZodOptional<z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodEnum<{
        high: "high";
        medium: "medium";
        low: "low";
    }>>>;
    required: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type ShouldFind = z.infer<typeof ShouldFindSchema>;
/**
 * A single eval scenario within a YAML eval file.
 */
export declare const EvalScenarioSchema: z.ZodObject<{
    name: z.ZodString;
    given: z.ZodString;
    files: z.ZodArray<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
    should_find: z.ZodArray<z.ZodObject<{
        finding: z.ZodString;
        severity: z.ZodOptional<z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodEnum<{
            high: "high";
            medium: "medium";
            low: "low";
        }>>>;
        required: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>;
    should_not_find: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type EvalScenario = z.infer<typeof EvalScenarioSchema>;
/**
 * Root schema for a YAML eval file. Each file defines a category of evals
 * sharing a common skill.
 *
 * Example YAML:
 *   skill: skills/bug-detection.md
 *   evals:
 *     - name: null-property-access
 *       given: code that accesses .find() result without null checking
 *       files: [fixtures/null-property-access/handler.ts]
 *       should_find:
 *         - finding: null access on user.name
 *           severity: high
 */
export declare const EvalFileSchema: z.ZodObject<{
    skill: z.ZodString;
    model: z.ZodDefault<z.ZodString>;
    evals: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        given: z.ZodString;
        files: z.ZodArray<z.ZodString>;
        model: z.ZodOptional<z.ZodString>;
        should_find: z.ZodArray<z.ZodObject<{
            finding: z.ZodString;
            severity: z.ZodOptional<z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodEnum<{
                high: "high";
                medium: "medium";
                low: "low";
            }>>>;
            required: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strip>>;
        should_not_find: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type EvalFile = z.infer<typeof EvalFileSchema>;
/**
 * Resolved eval metadata ready for execution. Combines the file-level
 * defaults with scenario-level overrides.
 */
export interface EvalMeta {
    /** Scenario name (e.g., "null-property-access") */
    name: string;
    /** Category name from the YAML filename (e.g., "bug-detection") */
    category: string;
    /** What this eval tests (BDD "given") */
    given: string;
    /** Resolved absolute path to the skill file */
    skillPath: string;
    /** Resolved absolute paths to fixture files */
    filePaths: string[];
    /** Model to use for skill execution */
    model: string;
    /** What Warden should find */
    should_find: ShouldFind[];
    /** What Warden should NOT report */
    should_not_find: string[];
}
/**
 * Judge verdict for a single expectation.
 */
export declare const ExpectationVerdictSchema: z.ZodObject<{
    met: z.ZodBoolean;
    matchedFindingIndex: z.ZodNullable<z.ZodNumber>;
    reasoning: z.ZodString;
}, z.core.$strip>;
export type ExpectationVerdict = z.infer<typeof ExpectationVerdictSchema>;
/**
 * Judge verdict for a single anti-expectation.
 */
export declare const AntiExpectationVerdictSchema: z.ZodObject<{
    violated: z.ZodBoolean;
    violatingFindingIndex: z.ZodNullable<z.ZodNumber>;
    reasoning: z.ZodString;
}, z.core.$strip>;
export type AntiExpectationVerdict = z.infer<typeof AntiExpectationVerdictSchema>;
/**
 * Complete judge response for an eval.
 */
export declare const JudgeResponseSchema: z.ZodObject<{
    expectations: z.ZodArray<z.ZodObject<{
        met: z.ZodBoolean;
        matchedFindingIndex: z.ZodNullable<z.ZodNumber>;
        reasoning: z.ZodString;
    }, z.core.$strip>>;
    antiExpectations: z.ZodArray<z.ZodObject<{
        violated: z.ZodBoolean;
        violatingFindingIndex: z.ZodNullable<z.ZodNumber>;
        reasoning: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type JudgeResponse = z.infer<typeof JudgeResponseSchema>;
/**
 * Result of running a single eval scenario.
 */
export interface EvalResult {
    /** Display name (e.g., "bug-detection/null-property-access") */
    name: string;
    /** Eval metadata */
    meta: EvalMeta;
    /** Whether the eval passed overall */
    passed: boolean;
    /** Skill report from the agent run */
    report: SkillReport;
    /** Judge response with per-expectation verdicts */
    judgeResponse: JudgeResponse;
    /** Verbose logs from the agent run */
    logs: string[];
    /** Total duration of the eval (agent + judge) in ms */
    durationMs: number;
    /** Usage from the skill run */
    skillUsage?: UsageStats;
    /** Usage from the judge call */
    judgeUsage?: UsageStats;
}
/**
 * Determine if an eval passed based on judge response and eval metadata.
 */
export declare function evalPassed(meta: EvalMeta, judgeResponse: JudgeResponse): boolean;
/**
 * Format an eval result for human-readable output.
 */
export declare function formatEvalResult(result: EvalResult): string;
//# sourceMappingURL=types.d.ts.map