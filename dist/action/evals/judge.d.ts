import type { Finding } from '../types/index.js';
import type { EvalMeta, JudgeResponse } from './types.js';
import type { UsageStats } from '../types/index.js';
export interface JudgeResult {
    response: JudgeResponse;
    usage: UsageStats;
}
/**
 * Run the LLM judge to evaluate agent findings against eval assertions.
 */
export declare function runJudge(meta: EvalMeta, findings: Finding[], apiKey: string): Promise<JudgeResult>;
//# sourceMappingURL=judge.d.ts.map