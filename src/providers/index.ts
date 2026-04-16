/**
 * Provider registry and factory.
 *
 * Creates the correct LLMProvider instance based on the configured provider name.
 */

import type { LLMProvider, ProviderName } from "./types.js";
import { ClaudeProvider } from "./claude.js";
import { OpenAIProvider } from "./openai.js";
import { GeminiProvider } from "./gemini.js";

export type { LLMProvider, ProviderName } from "./types.js";
export type {
  LLMQueryOptions,
  LLMQueryResult,
  AuxiliaryQueryResult,
} from "./types.js";

/** Create a provider instance by name. Defaults to 'openai'. */
export function createProvider(name: ProviderName = "openai"): LLMProvider {
  switch (name) {
    case "claude":
      return new ClaudeProvider();
    case "openai":
      return new OpenAIProvider();
    case "gemini":
      return new GeminiProvider();
    default: {
      const _exhaustive: never = name;
      throw new Error(`Unknown provider: ${_exhaustive}`);
    }
  }
}

/** All supported provider names. */
export const PROVIDER_NAMES: readonly ProviderName[] = [
  "claude",
  "openai",
  "gemini",
] as const;
