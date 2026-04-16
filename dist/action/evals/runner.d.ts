import type { EvalMeta, EvalResult } from './types.js';
export interface RunEvalOptions {
    /** Anthropic API key */
    apiKey: string;
    /** Override the model from the YAML spec */
    model?: string;
    /** Enable verbose logging */
    verbose?: boolean;
}
/**
 * Run a single eval scenario end-to-end.
 *
 * The only thing mocked is the GitHub event payload (no real PR).
 * Everything else runs for real: git repo, diff parsing, SDK invocation,
 * agent with Read/Grep tools, finding extraction, LLM judge.
 */
export declare function runEval(meta: EvalMeta, options: RunEvalOptions): Promise<EvalResult>;
//# sourceMappingURL=runner.d.ts.map