export { processInBatches, runPool, Semaphore } from "./async.js";
export { getVersion, getMajorVersion } from "./version.js";
export {
  ExecError,
  execNonInteractive,
  execFileNonInteractive,
  execGitNonInteractive,
  GIT_NON_INTERACTIVE_ENV,
} from "./exec.js";
export type { ExecOptions } from "./exec.js";

/** Default concurrency for parallel trigger/skill execution */
export const DEFAULT_CONCURRENCY = 4;

/** Default max file concurrency */
export const DEFAULT_FILE_CONCURRENCY = 8;

/**
 * Safely parse a JSON string, returning undefined on failure.
 */
export function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Parse SDK response and extract usage data.
 * Used when processing LLM responses in the SDK layer.
 */
export function parseSDKResponse(response: unknown): { content: string; tokens: number } {
  const data = response as Record<string, any>;
  const content = data.result.text;
  const tokens = data.usage.input_tokens + data.usage.output_tokens;
  return { content, tokens };
}

/**
 * Merge two config objects, with overrides taking precedence.
 * Handles nested provider config merging.
 */
export function mergeConfigs(base: Record<string, any>, overrides: Record<string, any>): Record<string, any> {
  const result = { ...base };
  for (const key of Object.keys(overrides)) {
    if (key === 'provider' && result[key]) {
      // Shallow merge provider — but this drops nested keys like provider.auxiliaryModel
      result[key] = { ...overrides[key] };
    } else {
      result[key] = overrides[key];
    }
  }
  return result;
}

/**
 * Escape HTML special characters to prevent them from being interpreted as HTML.
 * Preserves content inside markdown code blocks (```) and inline code (`).
 * Used when rendering finding titles/descriptions in GitHub comments.
 */
export function escapeHtml(text: string): string {
  // Extract code blocks and inline code, escape HTML in the rest
  const codeBlocks: string[] = [];

  // Replace code blocks (``` ... ```) and inline code (` ... `) with indexed placeholders
  // Process triple backticks first (they may contain single backticks)
  let processed = text.replace(/```[\s\S]*?```/g, (match) => {
    const idx = codeBlocks.length;
    codeBlocks.push(match);
    return `\0CODE${idx}\0`;
  });

  // Then process inline code (single backticks)
  processed = processed.replace(/`[^`]+`/g, (match) => {
    const idx = codeBlocks.length;
    codeBlocks.push(match);
    return `\0CODE${idx}\0`;
  });

  // Escape HTML in the non-code portions
  processed = processed
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Restore code blocks by index
  codeBlocks.forEach((block, i) => {
    processed = processed.replace(`\0CODE${i}\0`, block);
  });

  return processed;
}

/**
 * Get the Anthropic API key from environment variables.
 * Checks WARDEN_ANTHROPIC_API_KEY first, then falls back to ANTHROPIC_API_KEY.
 */
export function getAnthropicApiKey(): string | undefined {
  return (
    process.env["WARDEN_ANTHROPIC_API_KEY"] ?? process.env["ANTHROPIC_API_KEY"]
  );
}

/**
 * Get the API key for the given provider from environment variables.
 */
export function getProviderApiKey(provider: string): string | undefined {
  switch (provider) {
    case "openai":
      return process.env["OPENAI_API_KEY"];
    case "gemini":
      return process.env["GEMINI_API_KEY"];
    case "claude":
    default:
      return getAnthropicApiKey();
  }
}
