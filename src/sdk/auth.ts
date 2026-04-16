import { ExecError, execFileNonInteractive } from "../utils/exec.js";
import { WardenAuthenticationError } from "./errors.js";
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
export function verifyAuth({
  apiKey,
  provider,
}: {
  apiKey?: string;
  provider?: LLMProvider;
}): void {
  // Non-Claude providers handle their own auth
  if (provider && provider.name !== "claude") {
    provider.verifyAuth({ apiKey });
    return;
  }
  // Direct API auth — no subprocess needed
  if (apiKey) return;

  try {
    execFileNonInteractive("claude", ["--version"], { timeout: 5000 });
  } catch (error) {
    // execFileNonInteractive wraps spawn failures in ExecError.
    // The original error message (e.g., "spawn claude ENOENT") is in ExecError.stderr.
    const isNotFound =
      error instanceof ExecError
        ? error.stderr.includes("ENOENT")
        : (error as NodeJS.ErrnoException).code === "ENOENT";
    if (isNotFound) {
      throw new WardenAuthenticationError(
        "Claude Code CLI not found on PATH.\n" +
          "Either install Claude Code (https://claude.ai/install.sh) or set an API key.",
        { cause: error },
      );
    }
    const detail =
      error instanceof ExecError ? error.stderr : (error as Error).message;
    throw new WardenAuthenticationError(
      `Claude Code CLI found but failed to execute: ${detail}\n` +
        "Check that the claude binary has correct permissions and can run in this environment.",
      { cause: error },
    );
  }
}
