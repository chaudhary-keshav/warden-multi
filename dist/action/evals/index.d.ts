import type { EvalFile, EvalMeta } from './types.js';
export type { EvalMeta };
/**
 * Discover all YAML eval files in the evals directory.
 * Returns absolute paths to .yaml files, sorted alphabetically.
 */
export declare function discoverEvalFiles(baseDir?: string): string[];
/**
 * Load and validate a YAML eval file.
 */
export declare function loadEvalFile(filePath: string): EvalFile;
/**
 * Resolve all eval scenarios from a YAML file into executable EvalMeta objects.
 * Resolves relative paths for skills and fixtures against the evals directory.
 */
export declare function resolveEvalMetas(evalFile: EvalFile, yamlPath: string): EvalMeta[];
/**
 * Discover and load all evals from YAML files. Returns a flat list of
 * resolved EvalMeta objects ready for execution.
 */
export declare function discoverEvals(baseDir?: string): EvalMeta[];
//# sourceMappingURL=index.d.ts.map