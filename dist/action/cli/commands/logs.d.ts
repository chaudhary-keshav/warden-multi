import type { CLIOptions, LogsOptions } from '../args.js';
import type { Reporter } from '../output/reporter.js';
/**
 * List all JSONL log files in .warden/logs/.
 */
export declare function runLogsList(options: CLIOptions, reporter: Reporter): Promise<number>;
/**
 * Show results from JSONL log files (replaces `warden replay`).
 */
export declare function runLogsShow(logsOptions: LogsOptions, options: CLIOptions, reporter: Reporter): Promise<number>;
/**
 * Garbage-collect expired log files.
 */
export declare function runLogsGc(options: CLIOptions, reporter: Reporter): Promise<number>;
/**
 * Dispatch to the appropriate logs subcommand.
 */
export declare function runLogs(logsOptions: LogsOptions, options: CLIOptions, reporter: Reporter): Promise<number>;
//# sourceMappingURL=logs.d.ts.map