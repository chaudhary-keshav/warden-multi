import type { LLMProvider } from "../providers/types.js";
/**
 * Pre-flight auth check: verify that authentication will work before starting analysis.
 *
 * When a non-Claude provider is configured, delegates to provider.verifyAuth().
 * For Claude (default):
 * - If an API key is provided, returns immediately (direct API auth).
 * - If no API key, verifies the `claude` binary exists on PATH so the SDK
 *   can use Claude Code subscription auth. Throws WardenAuthenticationError
 *   if the binary is missing.
 */
export declare function verifyAuth({ apiKey, provider, }: {
    apiKey?: string;
    provider?: LLMProvider;
}): void;
//# sourceMappingURL=auth.d.ts.map