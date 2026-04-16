/**
 * Provider registry and factory.
 *
 * Creates the correct LLMProvider instance based on the configured provider name.
 */
import type { LLMProvider, ProviderName } from "./types.js";
export type { LLMProvider, ProviderName } from "./types.js";
export type { LLMQueryOptions, LLMQueryResult, AuxiliaryQueryResult, } from "./types.js";
/** Create a provider instance by name. Defaults to 'openai'. */
export declare function createProvider(name?: ProviderName): LLMProvider;
/** All supported provider names. */
export declare const PROVIDER_NAMES: readonly ProviderName[];
//# sourceMappingURL=index.d.ts.map