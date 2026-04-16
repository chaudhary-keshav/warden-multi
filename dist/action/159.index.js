export const id = 159;
export const ids = [159];
export const modules = {

/***/ 62159:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   resolveRemoteAgent: () => (/* binding */ resolveRemoteAgent),
/* harmony export */   resolveRemoteSkill: () => (/* binding */ resolveRemoteSkill)
/* harmony export */ });
/* unused harmony exports parseRemoteRef, formatRemoteRef, getSkillsCacheDir, getRemotePath, getStatePath, loadState, saveState, getCacheTtlSeconds, shouldRefresh, fetchRemote, discoverRemoteSkills, removeRemote, listCachedRemotes, discoverRemoteAgents */
/* harmony import */ var node_fs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(73024);
/* harmony import */ var node_fs__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(node_fs__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var node_os__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(48161);
/* harmony import */ var node_os__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(node_os__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var node_path__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(76760);
/* harmony import */ var node_path__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(node_path__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var zod__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(90606);
/* harmony import */ var _utils_exec_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(78879);
/* harmony import */ var _loader_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(83138);






/** Default TTL for unpinned remote skills: 24 hours */
const DEFAULT_TTL_SECONDS = 86400;
/** Schema for a single remote entry in state.json */
const RemoteEntrySchema = zod__WEBPACK_IMPORTED_MODULE_5__/* .object */ .Ikc({
    sha: zod__WEBPACK_IMPORTED_MODULE_5__/* .string */ .YjP(),
    fetchedAt: zod__WEBPACK_IMPORTED_MODULE_5__/* .string */ .YjP().datetime(),
    cloneUrl: zod__WEBPACK_IMPORTED_MODULE_5__/* .string */ .YjP().optional(),
});
/** Schema for the entire state.json file */
const RemoteStateSchema = zod__WEBPACK_IMPORTED_MODULE_5__/* .object */ .Ikc({
    remotes: zod__WEBPACK_IMPORTED_MODULE_5__/* .record */ .g1P(zod__WEBPACK_IMPORTED_MODULE_5__/* .string */ .YjP(), RemoteEntrySchema),
});
/** Schema for a plugin in marketplace.json */
const MarketplacePluginSchema = zod__WEBPACK_IMPORTED_MODULE_5__/* .object */ .Ikc({
    name: zod__WEBPACK_IMPORTED_MODULE_5__/* .string */ .YjP(),
    source: zod__WEBPACK_IMPORTED_MODULE_5__/* .string */ .YjP(),
    description: zod__WEBPACK_IMPORTED_MODULE_5__/* .string */ .YjP().optional(),
    category: zod__WEBPACK_IMPORTED_MODULE_5__/* .string */ .YjP().optional(),
});
/** Schema for .claude-plugin/marketplace.json */
const MarketplaceConfigSchema = zod__WEBPACK_IMPORTED_MODULE_5__/* .object */ .Ikc({
    $schema: zod__WEBPACK_IMPORTED_MODULE_5__/* .string */ .YjP().optional(),
    name: zod__WEBPACK_IMPORTED_MODULE_5__/* .string */ .YjP(),
    description: zod__WEBPACK_IMPORTED_MODULE_5__/* .string */ .YjP().optional(),
    plugins: zod__WEBPACK_IMPORTED_MODULE_5__/* .array */ .YOg(MarketplacePluginSchema),
});
/**
 * Normalize a GitHub URL to owner/repo format.
 * Returns null if the input is not a recognized GitHub URL.
 *
 * Supports:
 * - https://github.com/owner/repo
 * - https://github.com/owner/repo.git
 * - git@github.com:owner/repo.git
 */
function normalizeGitHubUrl(input) {
    // HTTPS URL: https://github.com/owner/repo or https://github.com/owner/repo.git
    const httpsMatch = input.match(/^https?:\/\/github\.com\/([^/]+)\/([^/@]+?)(?:\.git)?$/);
    if (httpsMatch) {
        return `${httpsMatch[1]}/${httpsMatch[2]}`;
    }
    // SSH URL: git@github.com:owner/repo.git
    const sshMatch = input.match(/^git@github\.com:([^/]+)\/([^/@]+?)(?:\.git)?$/);
    if (sshMatch) {
        return `${sshMatch[1]}/${sshMatch[2]}`;
    }
    return null;
}
/**
 * Parse a remote reference string into its components.
 * Supports formats:
 * - "owner/repo" or "owner/repo@sha"
 * - "https://github.com/owner/repo" or "https://github.com/owner/repo@sha"
 * - "https://github.com/owner/repo.git" or "https://github.com/owner/repo.git@sha"
 * - "git@github.com:owner/repo.git" or "git@github.com:owner/repo.git@sha"
 */
function parseRemoteRef(ref) {
    let inputRef = ref;
    let sha;
    // Extract SHA suffix from the input before URL normalization.
    // The SHA is always at the end, after a @ that follows the repo name.
    // For git@github.com URLs, we need to find the @ after the colon.
    if (ref.startsWith('git@')) {
        const colonIndex = ref.indexOf(':');
        if (colonIndex !== -1) {
            const afterColon = ref.slice(colonIndex + 1);
            const shaAtIndex = afterColon.lastIndexOf('@');
            if (shaAtIndex !== -1) {
                sha = afterColon.slice(shaAtIndex + 1);
                inputRef = ref.slice(0, colonIndex + 1 + shaAtIndex);
            }
        }
    }
    else {
        const lastAtIndex = ref.lastIndexOf('@');
        if (lastAtIndex !== -1) {
            const potentialSha = ref.slice(lastAtIndex + 1);
            // SHA should not contain : or / (those would indicate URL structure)
            if (!potentialSha.includes(':') && !potentialSha.includes('/')) {
                if (!potentialSha) {
                    throw new _loader_js__WEBPACK_IMPORTED_MODULE_4__/* .SkillLoaderError */ .vN(`Invalid remote ref: ${ref} (empty SHA after @)`);
                }
                sha = potentialSha;
                inputRef = ref.slice(0, lastAtIndex);
            }
        }
    }
    // Normalize GitHub URLs to owner/repo format.
    // When the input is a full URL, preserve it as cloneUrl for fetchRemote.
    const normalized = normalizeGitHubUrl(inputRef);
    // Upgrade http:// to https:// to prevent cloning over plain HTTP
    const cloneUrl = normalized ? inputRef.replace(/^http:\/\//i, 'https://') : undefined;
    const repoPath = normalized ?? inputRef;
    const slashIndex = repoPath.indexOf('/');
    if (slashIndex === -1) {
        throw new _loader_js__WEBPACK_IMPORTED_MODULE_4__/* .SkillLoaderError */ .vN(`Invalid remote ref: ${ref} (expected owner/repo format)`);
    }
    const owner = repoPath.slice(0, slashIndex);
    const repo = repoPath.slice(slashIndex + 1);
    if (!owner || !repo) {
        throw new _loader_js__WEBPACK_IMPORTED_MODULE_4__/* .SkillLoaderError */ .vN(`Invalid remote ref: ${ref} (empty owner or repo)`);
    }
    if (repo.includes('/')) {
        throw new _loader_js__WEBPACK_IMPORTED_MODULE_4__/* .SkillLoaderError */ .vN(`Invalid remote ref: ${ref} (repo name cannot contain /)`);
    }
    // Security: Prevent git flag injection by rejecting values starting with '-'
    if (owner.startsWith('-')) {
        throw new _loader_js__WEBPACK_IMPORTED_MODULE_4__/* .SkillLoaderError */ .vN(`Invalid remote ref: ${ref} (owner cannot start with -)`);
    }
    if (repo.startsWith('-')) {
        throw new _loader_js__WEBPACK_IMPORTED_MODULE_4__/* .SkillLoaderError */ .vN(`Invalid remote ref: ${ref} (repo cannot start with -)`);
    }
    if (sha?.startsWith('-')) {
        throw new _loader_js__WEBPACK_IMPORTED_MODULE_4__/* .SkillLoaderError */ .vN(`Invalid remote ref: ${ref} (SHA cannot start with -)`);
    }
    // Security: Prevent path traversal via '..' in owner or repo.
    // Only allow characters valid in GitHub usernames/repo names: alphanumeric, hyphens, dots, underscores.
    const safeNamePattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
    if (!safeNamePattern.test(owner)) {
        throw new _loader_js__WEBPACK_IMPORTED_MODULE_4__/* .SkillLoaderError */ .vN(`Invalid remote ref: ${ref} (owner contains invalid characters)`);
    }
    if (!safeNamePattern.test(repo)) {
        throw new _loader_js__WEBPACK_IMPORTED_MODULE_4__/* .SkillLoaderError */ .vN(`Invalid remote ref: ${ref} (repo contains invalid characters)`);
    }
    return { owner, repo, sha, cloneUrl };
}
/**
 * Format a parsed remote ref back to string format.
 */
function formatRemoteRef(parsed) {
    const base = `${parsed.owner}/${parsed.repo}`;
    return parsed.sha ? `${base}@${parsed.sha}` : base;
}
/**
 * Get the base directory for caching remote skills.
 * Respects WARDEN_STATE_DIR environment variable.
 * Default: ~/.local/warden/skills/
 */
function getSkillsCacheDir() {
    const stateDir = process.env['WARDEN_STATE_DIR'];
    if (stateDir) {
        return (0,node_path__WEBPACK_IMPORTED_MODULE_2__.join)(stateDir, 'skills');
    }
    return (0,node_path__WEBPACK_IMPORTED_MODULE_2__.join)((0,node_os__WEBPACK_IMPORTED_MODULE_1__.homedir)(), '.local', 'warden', 'skills');
}
/**
 * Get the cache path for a specific remote ref.
 * - Unpinned: ~/.local/warden/skills/owner/repo/
 * - Pinned: ~/.local/warden/skills/owner/repo@sha/
 */
function getRemotePath(ref) {
    const parsed = parseRemoteRef(ref);
    const cacheDir = getSkillsCacheDir();
    if (parsed.sha) {
        return (0,node_path__WEBPACK_IMPORTED_MODULE_2__.join)(cacheDir, parsed.owner, `${parsed.repo}@${parsed.sha}`);
    }
    return (0,node_path__WEBPACK_IMPORTED_MODULE_2__.join)(cacheDir, parsed.owner, parsed.repo);
}
/**
 * Get the path to the state.json file.
 */
function getStatePath() {
    return (0,node_path__WEBPACK_IMPORTED_MODULE_2__.join)(getSkillsCacheDir(), 'state.json');
}
/**
 * Load the remote state from state.json.
 * Returns an empty state if the file doesn't exist.
 */
function loadState() {
    const statePath = getStatePath();
    if (!(0,node_fs__WEBPACK_IMPORTED_MODULE_0__.existsSync)(statePath)) {
        return { remotes: {} };
    }
    try {
        const content = (0,node_fs__WEBPACK_IMPORTED_MODULE_0__.readFileSync)(statePath, 'utf-8');
        const data = JSON.parse(content);
        return RemoteStateSchema.parse(data);
    }
    catch (error) {
        // If state is corrupted, start fresh
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Warning: Failed to load state.json, starting fresh: ${message}`);
        return { remotes: {} };
    }
}
/**
 * Save the remote state to state.json.
 * Uses atomic write (write to temp, then rename).
 */
function saveState(state) {
    const statePath = getStatePath();
    const stateDir = (0,node_path__WEBPACK_IMPORTED_MODULE_2__.dirname)(statePath);
    // Ensure directory exists
    if (!(0,node_fs__WEBPACK_IMPORTED_MODULE_0__.existsSync)(stateDir)) {
        (0,node_fs__WEBPACK_IMPORTED_MODULE_0__.mkdirSync)(stateDir, { recursive: true });
    }
    // Write atomically
    const tempPath = `${statePath}.tmp`;
    (0,node_fs__WEBPACK_IMPORTED_MODULE_0__.writeFileSync)(tempPath, JSON.stringify(state, null, 2), 'utf-8');
    // Rename is atomic on most filesystems
    (0,node_fs__WEBPACK_IMPORTED_MODULE_0__.renameSync)(tempPath, statePath);
}
/**
 * Get the TTL for remote skill cache in seconds.
 * Respects WARDEN_SKILL_CACHE_TTL environment variable.
 */
function getCacheTtlSeconds() {
    const envTtl = process.env['WARDEN_SKILL_CACHE_TTL'];
    if (envTtl) {
        const parsed = parseInt(envTtl, 10);
        if (!isNaN(parsed) && parsed > 0) {
            return parsed;
        }
    }
    return DEFAULT_TTL_SECONDS;
}
/**
 * Check if an unpinned remote ref needs to be refreshed.
 * Pinned refs (with @sha) never need refresh.
 */
function shouldRefresh(ref, state) {
    const parsed = parseRemoteRef(ref);
    // Pinned refs are immutable - never refresh
    if (parsed.sha) {
        return false;
    }
    const entry = state.remotes[formatRemoteRef(parsed)];
    if (!entry) {
        return true; // Not cached, needs fetch
    }
    const fetchedAt = new Date(entry.fetchedAt).getTime();
    const now = Date.now();
    const ttl = getCacheTtlSeconds() * 1000;
    return now - fetchedAt > ttl;
}
/**
 * Execute a git command and return stdout.
 * Uses non-interactive mode to prevent SSH passphrase prompts.
 * Throws SkillLoaderError on failure.
 */
function execGit(args, options) {
    try {
        return (0,_utils_exec_js__WEBPACK_IMPORTED_MODULE_3__/* .execGitNonInteractive */ .rd)(args, { cwd: options?.cwd });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new _loader_js__WEBPACK_IMPORTED_MODULE_4__/* .SkillLoaderError */ .vN(`Git command failed: git ${args.join(' ')}: ${message}`, { cause: error });
    }
}
/**
 * Clone or update a remote repository to the cache.
 * Returns the SHA of the fetched commit.
 */
async function fetchRemote(ref, options = {}) {
    const { force = false, offline = false, onProgress } = options;
    const parsed = parseRemoteRef(ref);
    const remotePath = getRemotePath(ref);
    const state = loadState();
    // Normalize state key so different URL forms (SSH, HTTPS, shorthand) share one entry
    const stateKey = formatRemoteRef(parsed);
    const isPinned = !!parsed.sha;
    const isCached = (0,node_fs__WEBPACK_IMPORTED_MODULE_0__.existsSync)(remotePath);
    const needsRefresh = shouldRefresh(ref, state);
    // Check if we have a valid cache (directory exists AND state entry exists)
    const stateEntry = state.remotes[stateKey];
    const hasValidCache = isCached && !!stateEntry;
    // Handle offline mode
    if (offline) {
        if (hasValidCache) {
            return stateEntry.sha;
        }
        throw new _loader_js__WEBPACK_IMPORTED_MODULE_4__/* .SkillLoaderError */ .vN(`Remote skill not cached and offline mode enabled: ${ref}`);
    }
    // Pinned + valid cache = use cache (SHA is immutable)
    if (isPinned && hasValidCache && !force && parsed.sha) {
        return parsed.sha;
    }
    // Unpinned + valid cache + fresh = use cache
    if (!isPinned && hasValidCache && !needsRefresh && !force) {
        return stateEntry.sha;
    }
    // Use the original clone URL if provided, fall back to stored URL from state, then HTTPS
    const repoUrl = parsed.cloneUrl ?? stateEntry?.cloneUrl ?? `https://github.com/${parsed.owner}/${parsed.repo}.git`;
    // Clone or update
    if (!isCached) {
        onProgress?.(`Cloning ${ref}...`);
        // Ensure parent directory exists
        const parentDir = (0,node_path__WEBPACK_IMPORTED_MODULE_2__.dirname)(remotePath);
        if (!(0,node_fs__WEBPACK_IMPORTED_MODULE_0__.existsSync)(parentDir)) {
            (0,node_fs__WEBPACK_IMPORTED_MODULE_0__.mkdirSync)(parentDir, { recursive: true });
        }
        try {
            // Note: '--' separates flags from positional args to prevent flag injection
            const { sha } = parsed;
            if (sha) {
                // For pinned refs, shallow clone then checkout the specific SHA
                execGit(['clone', '--depth=1', '--', repoUrl, remotePath]);
                try {
                    // Try to fetch the pinned SHA directly
                    execGit(['fetch', '--depth=1', 'origin', '--', sha], { cwd: remotePath });
                    execGit(['checkout', sha], { cwd: remotePath });
                }
                catch {
                    // If SHA not found in shallow history, do a full fetch and retry
                    execGit(['fetch', '--unshallow'], { cwd: remotePath });
                    execGit(['checkout', sha], { cwd: remotePath });
                }
            }
            else {
                // For unpinned refs, shallow clone of default branch
                execGit(['clone', '--depth=1', '--', repoUrl, remotePath]);
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            // Detect HTTPS auth failures and suggest SSH URL
            if (!parsed.cloneUrl && (message.includes('terminal prompts disabled') || message.includes('could not read Username'))) {
                throw new _loader_js__WEBPACK_IMPORTED_MODULE_4__/* .SkillLoaderError */ .vN(`Failed to clone ${stateKey} via HTTPS. ` +
                    `For private repos, use the SSH URL: warden add --remote git@github.com:${parsed.owner}/${parsed.repo}.git`);
            }
            throw error;
        }
    }
    else {
        // Update existing cache
        onProgress?.(`Updating ${ref}...`);
        if (!isPinned) {
            // For unpinned refs, pull latest
            execGit(['fetch', '--depth=1', 'origin'], { cwd: remotePath });
            execGit(['reset', '--hard', 'origin/HEAD'], { cwd: remotePath });
        }
        // Pinned refs don't need updates - SHA is immutable
    }
    // Get the current HEAD SHA
    const sha = execGit(['rev-parse', 'HEAD'], { cwd: remotePath });
    // Update state with normalized key — preserve cloneUrl for future re-clones
    const cloneUrl = parsed.cloneUrl ?? stateEntry?.cloneUrl;
    state.remotes[stateKey] = {
        sha,
        fetchedAt: new Date().toISOString(),
        ...(cloneUrl ? { cloneUrl } : {}),
    };
    saveState(state);
    return sha;
}
/**
 * Parse marketplace.json from a remote repository if it exists.
 * Returns null if the file doesn't exist or is invalid.
 */
function parseMarketplaceConfig(remotePath) {
    const marketplacePath = (0,node_path__WEBPACK_IMPORTED_MODULE_2__.join)(remotePath, '.claude-plugin', 'marketplace.json');
    if (!(0,node_fs__WEBPACK_IMPORTED_MODULE_0__.existsSync)(marketplacePath)) {
        return null;
    }
    try {
        const content = (0,node_fs__WEBPACK_IMPORTED_MODULE_0__.readFileSync)(marketplacePath, 'utf-8');
        const data = JSON.parse(content);
        return MarketplaceConfigSchema.parse(data);
    }
    catch {
        // Invalid or malformed marketplace.json - fall back to traditional discovery
        return null;
    }
}
/** Directories to search for skills in remote repositories */
const REMOTE_SKILL_DIRECTORIES = [
    '', // root level
    'skills', // skills/ subdirectory
    '.agents/skills', // General agent skills (primary)
    '.claude/skills', // Claude Code skills
    '.warden/skills', // Warden-specific (legacy)
];
/** Directories to search for agents in remote repositories */
const REMOTE_AGENT_DIRECTORIES = [
    '', // root level
    'agents', // agents/ subdirectory
    '.agents/agents', // Primary
    '.claude/agents', // Claude Code agents
    '.warden/agents', // Legacy
];
/**
 * Discover entries (skills or agents) using traditional directory layout.
 * Searches the given subdirectories for directories containing the marker file.
 * First occurrence of a name wins (earlier directories have higher precedence).
 */
async function discoverTraditional(remotePath, directories, markerFile) {
    const results = [];
    const seenNames = new Set();
    for (const subdir of directories) {
        const searchPath = subdir ? (0,node_path__WEBPACK_IMPORTED_MODULE_2__.join)(remotePath, subdir) : remotePath;
        if (!(0,node_fs__WEBPACK_IMPORTED_MODULE_0__.existsSync)(searchPath))
            continue;
        const entries = (0,node_fs__WEBPACK_IMPORTED_MODULE_0__.readdirSync)(searchPath);
        for (const entry of entries) {
            if (entry.startsWith('.'))
                continue;
            const entryPath = (0,node_path__WEBPACK_IMPORTED_MODULE_2__.join)(searchPath, entry);
            const stat = (0,node_fs__WEBPACK_IMPORTED_MODULE_0__.statSync)(entryPath);
            if (stat.isDirectory()) {
                const markerPath = (0,node_path__WEBPACK_IMPORTED_MODULE_2__.join)(entryPath, markerFile);
                if ((0,node_fs__WEBPACK_IMPORTED_MODULE_0__.existsSync)(markerPath)) {
                    try {
                        const loaded = await (0,_loader_js__WEBPACK_IMPORTED_MODULE_4__/* .loadSkillFromMarkdown */ .hl)(markerPath);
                        if (!seenNames.has(loaded.name)) {
                            seenNames.add(loaded.name);
                            results.push({
                                name: loaded.name,
                                description: loaded.description,
                                path: entryPath,
                            });
                        }
                    }
                    catch {
                        // Skip invalid entries
                    }
                }
            }
        }
    }
    return results;
}
/**
 * Discover skills using marketplace format.
 * Searches plugins/{plugin}/skills/ for each plugin defined in marketplace.json.
 */
async function discoverMarketplaceSkills(remotePath, config) {
    const skills = [];
    const seenNames = new Set();
    for (const plugin of config.plugins) {
        // Resolve plugin source path (e.g., "./plugins/sentry-skills" -> "plugins/sentry-skills")
        const pluginSource = plugin.source.replace(/^\.\//, '');
        const skillsPath = (0,node_path__WEBPACK_IMPORTED_MODULE_2__.join)(remotePath, pluginSource, 'skills');
        // Security: Ensure plugin source doesn't escape the repo directory via path traversal
        const resolvedSkillsPath = (0,node_path__WEBPACK_IMPORTED_MODULE_2__.resolve)(skillsPath);
        const resolvedRemotePath = (0,node_path__WEBPACK_IMPORTED_MODULE_2__.resolve)(remotePath);
        if (!resolvedSkillsPath.startsWith(resolvedRemotePath + '/')) {
            continue; // Silently skip — attacker-controlled marketplace.json, don't leak info
        }
        if (!(0,node_fs__WEBPACK_IMPORTED_MODULE_0__.existsSync)(skillsPath))
            continue;
        const entries = (0,node_fs__WEBPACK_IMPORTED_MODULE_0__.readdirSync)(skillsPath);
        for (const entry of entries) {
            if (entry.startsWith('.'))
                continue;
            const entryPath = (0,node_path__WEBPACK_IMPORTED_MODULE_2__.join)(skillsPath, entry);
            const stat = (0,node_fs__WEBPACK_IMPORTED_MODULE_0__.statSync)(entryPath);
            if (stat.isDirectory()) {
                const skillMdPath = (0,node_path__WEBPACK_IMPORTED_MODULE_2__.join)(entryPath, 'SKILL.md');
                if ((0,node_fs__WEBPACK_IMPORTED_MODULE_0__.existsSync)(skillMdPath)) {
                    try {
                        const skill = await (0,_loader_js__WEBPACK_IMPORTED_MODULE_4__/* .loadSkillFromMarkdown */ .hl)(skillMdPath);
                        if (!seenNames.has(skill.name)) {
                            seenNames.add(skill.name);
                            skills.push({
                                name: skill.name,
                                description: skill.description,
                                path: entryPath,
                                pluginName: plugin.name,
                            });
                        }
                    }
                    catch {
                        // Skip invalid skill directories
                    }
                }
            }
        }
    }
    return skills;
}
/**
 * Discover all skills in a cached remote repository.
 * Detects format and delegates to appropriate discovery function:
 * - If .claude-plugin/marketplace.json exists, uses marketplace discovery
 * - Otherwise, uses traditional discovery (root, skills/, .warden/skills, etc.)
 */
async function discoverRemoteSkills(ref) {
    const remotePath = getRemotePath(ref);
    if (!(0,node_fs__WEBPACK_IMPORTED_MODULE_0__.existsSync)(remotePath)) {
        throw new _loader_js__WEBPACK_IMPORTED_MODULE_4__/* .SkillLoaderError */ .vN(`Remote not cached: ${ref}. Run fetch first.`);
    }
    // Check for marketplace format
    const marketplaceConfig = parseMarketplaceConfig(remotePath);
    if (marketplaceConfig) {
        return discoverMarketplaceSkills(remotePath, marketplaceConfig);
    }
    // Fall back to traditional discovery
    return discoverTraditional(remotePath, REMOTE_SKILL_DIRECTORIES, 'SKILL.md');
}
/**
 * Resolve a remote entry (skill or agent) by name.
 * Fetches the remote, discovers available entries, and loads the matching one.
 */
async function resolveRemoteEntry(ref, name, markerFile, discoverFn, label, options = {}) {
    await fetchRemote(ref, options);
    const available = await discoverFn(ref);
    const match = available.find((entry) => entry.name === name);
    if (match) {
        return (0,_loader_js__WEBPACK_IMPORTED_MODULE_4__/* .loadSkillFromMarkdown */ .hl)((0,node_path__WEBPACK_IMPORTED_MODULE_2__.join)(match.path, markerFile));
    }
    const labelLower = label.toLowerCase();
    if (available.length === 0) {
        throw new _loader_js__WEBPACK_IMPORTED_MODULE_4__/* .SkillLoaderError */ .vN(`No ${labelLower}s found in remote: ${ref}`);
    }
    throw new _loader_js__WEBPACK_IMPORTED_MODULE_4__/* .SkillLoaderError */ .vN(`${label} '${name}' not found in remote: ${ref}. Available ${labelLower}s: ${available.map((e) => e.name).join(', ')}`);
}
/**
 * Resolve a skill from a remote repository.
 * Ensures the remote is fetched/cached, then loads the skill.
 * Matches by skill name (from SKILL.md), not directory name.
 */
async function resolveRemoteSkill(ref, skillName, options = {}) {
    return resolveRemoteEntry(ref, skillName, 'SKILL.md', discoverRemoteSkills, 'Skill', options);
}
/**
 * Remove a remote from the cache.
 */
function removeRemote(ref) {
    const remotePath = getRemotePath(ref);
    if (existsSync(remotePath)) {
        rmSync(remotePath, { recursive: true, force: true });
    }
    const stateKey = formatRemoteRef(parseRemoteRef(ref));
    const state = loadState();
    const { [stateKey]: _removed, ...remainingRemotes } = state.remotes;
    state.remotes = remainingRemotes;
    saveState(state);
}
/**
 * List all cached remotes with their metadata.
 */
function listCachedRemotes() {
    const state = loadState();
    return Object.entries(state.remotes).map(([ref, entry]) => ({ ref, entry }));
}
/**
 * Discover all agents in a cached remote repository.
 * Uses traditional discovery only (no marketplace format for agents).
 */
async function discoverRemoteAgents(ref) {
    const remotePath = getRemotePath(ref);
    if (!(0,node_fs__WEBPACK_IMPORTED_MODULE_0__.existsSync)(remotePath)) {
        throw new _loader_js__WEBPACK_IMPORTED_MODULE_4__/* .SkillLoaderError */ .vN(`Remote not cached: ${ref}. Run fetch first.`);
    }
    return discoverTraditional(remotePath, REMOTE_AGENT_DIRECTORIES, _loader_js__WEBPACK_IMPORTED_MODULE_4__/* .AGENT_MARKER_FILE */ .qA);
}
/**
 * Resolve an agent from a remote repository.
 * Ensures the remote is fetched/cached, then loads the agent.
 * Matches by agent name (from AGENT.md), not directory name.
 */
async function resolveRemoteAgent(ref, agentName, options = {}) {
    return resolveRemoteEntry(ref, agentName, _loader_js__WEBPACK_IMPORTED_MODULE_4__/* .AGENT_MARKER_FILE */ .qA, discoverRemoteAgents, 'Agent', options);
}


/***/ })

};
