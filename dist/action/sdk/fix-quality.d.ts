import type { Finding, UsageStats } from '../types/index.js';
export interface FixQualityStats {
    checked: number;
    strippedDeterministic: number;
    strippedSemantic: number;
    semanticUnavailable: number;
}
export interface SanitizeSuggestedFixesResult {
    findings: Finding[];
    stats: FixQualityStats;
    usage?: UsageStats;
}
interface SanitizeSuggestedFixesOptions {
    repoPath: string;
    apiKey?: string;
    maxRetries?: number;
}
export declare function sanitizeFindingsSuggestedFixes(findings: Finding[], options: SanitizeSuggestedFixesOptions): Promise<SanitizeSuggestedFixesResult>;
export {};
//# sourceMappingURL=fix-quality.d.ts.map