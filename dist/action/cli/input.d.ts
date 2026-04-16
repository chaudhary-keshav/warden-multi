/**
 * Custom error thrown when the user aborts via Ctrl+C during interactive input.
 * Allows callers to handle cleanup (e.g. Sentry flush) before exiting.
 */
export declare class UserAbortError extends Error {
    constructor();
}
/**
 * Read a single keypress from stdin in raw mode.
 */
export declare function readSingleKey(): Promise<string>;
//# sourceMappingURL=input.d.ts.map