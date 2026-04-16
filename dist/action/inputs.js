/**
 * Action Input Parsing and Validation
 *
 * Handles parsing inputs from GitHub Actions environment and validates them.
 */
import { SeverityThresholdSchema } from '../types/index.js';
import { DEFAULT_CONCURRENCY } from '../utils/index.js';
// -----------------------------------------------------------------------------
// Input Parsing
// -----------------------------------------------------------------------------
/**
 * Get an input value from GitHub Actions environment.
 * Checks both hyphenated (native) and underscored (composite action) formats.
 */
function getInput(name, required = false) {
    // Check both hyphenated (native GitHub Actions) and underscored (composite action) formats
    const hyphenEnv = `INPUT_${name.toUpperCase()}`;
    const underscoreEnv = `INPUT_${name.toUpperCase().replace(/-/g, '_')}`;
    const value = process.env[hyphenEnv] ?? process.env[underscoreEnv] ?? '';
    if (required && !value) {
        throw new Error(`Input required and not supplied: ${name}`);
    }
    return value;
}
/**
 * Parse a string input as a boolean, returning undefined for unrecognized values.
 */
function parseBooleanInput(value) {
    if (value === 'true')
        return true;
    if (value === 'false')
        return false;
    return undefined;
}
/**
 * Parse action inputs from the GitHub Actions environment.
 * Throws if required inputs are missing.
 */
export function parseActionInputs() {
    const provider = getInput('provider') || process.env['INPUT_PROVIDER'] || '';
    // Multi-provider auth: check for the right API key based on provider
    let anthropicApiKey = '';
    let oauthToken = '';
    if (provider === 'openai') {
        // OpenAI provider: set OPENAI_API_KEY from input or env
        const openaiKey = getInput('openai-api-key') || process.env['OPENAI_API_KEY'] || '';
        if (!openaiKey) {
            throw new Error('OpenAI API key not found. Provide via openai-api-key input or OPENAI_API_KEY env var.');
        }
        process.env['OPENAI_API_KEY'] = openaiKey;
    }
    else if (provider === 'gemini') {
        // Gemini provider: set GEMINI_API_KEY from input or env
        const geminiKey = getInput('gemini-api-key') || process.env['GEMINI_API_KEY'] || '';
        if (!geminiKey) {
            throw new Error('Gemini API key not found. Provide via gemini-api-key input or GEMINI_API_KEY env var.');
        }
        process.env['GEMINI_API_KEY'] = geminiKey;
    }
    else {
        // Claude provider (default for backward compat when no provider specified)
        const authToken = getInput('anthropic-api-key') ||
            process.env['WARDEN_ANTHROPIC_API_KEY'] ||
            process.env['ANTHROPIC_API_KEY'] ||
            process.env['CLAUDE_CODE_OAUTH_TOKEN'] ||
            '';
        if (!authToken) {
            throw new Error('Authentication not found. Provide an API key via anthropic-api-key input, ' +
                'ANTHROPIC_API_KEY env var, or OAuth token via CLAUDE_CODE_OAUTH_TOKEN env var.');
        }
        const isOAuthToken = authToken.startsWith('sk-ant-oat');
        anthropicApiKey = isOAuthToken ? '' : authToken;
        oauthToken = isOAuthToken ? authToken : '';
    }
    const failOnInput = getInput('fail-on');
    const failOn = SeverityThresholdSchema.safeParse(failOnInput).success
        ? failOnInput
        : undefined;
    const reportOnInput = getInput('report-on');
    const reportOn = SeverityThresholdSchema.safeParse(reportOnInput).success
        ? reportOnInput
        : undefined;
    const maxFindingsParsed = parseInt(getInput('max-findings') || '50', 10);
    const parallelParsed = parseInt(getInput('parallel') || String(DEFAULT_CONCURRENCY), 10);
    const requestChanges = parseBooleanInput(getInput('request-changes'));
    const failCheck = parseBooleanInput(getInput('fail-check'));
    return {
        provider,
        anthropicApiKey,
        oauthToken,
        githubToken: getInput('github-token') || process.env['GITHUB_TOKEN'] || '',
        configPath: getInput('config-path') || 'warden.toml',
        failOn,
        reportOn,
        maxFindings: Number.isNaN(maxFindingsParsed) ? 50 : maxFindingsParsed,
        requestChanges,
        failCheck,
        parallel: Number.isNaN(parallelParsed) ? DEFAULT_CONCURRENCY : parallelParsed,
    };
}
/**
 * Validate that required inputs are present.
 * Throws with a descriptive error if validation fails.
 */
export function validateInputs(inputs) {
    if (!inputs.githubToken) {
        throw new Error('GitHub token is required');
    }
}
/**
 * Set up environment variables for authentication.
 * Sets appropriate env vars based on token type (API key vs OAuth).
 */
export function setupAuthEnv(inputs) {
    if (inputs.provider === 'openai' || inputs.provider === 'gemini') {
        // Non-Claude providers: keys already set in parseActionInputs
        return;
    }
    if (inputs.oauthToken) {
        process.env['CLAUDE_CODE_OAUTH_TOKEN'] = inputs.oauthToken;
    }
    else {
        process.env['WARDEN_ANTHROPIC_API_KEY'] = inputs.anthropicApiKey;
        process.env['ANTHROPIC_API_KEY'] = inputs.anthropicApiKey;
    }
}
//# sourceMappingURL=inputs.js.map