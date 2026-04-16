/**
 * Local tool execution for non-Claude providers.
 *
 * Warden's analysis gives the LLM three read-only tools: Read, Grep, Glob.
 * Claude Code SDK executes these in its subprocess automatically.
 * For OpenAI / Gemini, we must execute them ourselves in response to
 * function-calling tool_calls, then feed results back to the model.
 */

import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, relative, isAbsolute } from "node:path";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Shared tool execution
// ---------------------------------------------------------------------------

/**
 * Run a Warden tool locally and return the string result.
 *
 * @param name  Tool name: Read, Grep, or Glob
 * @param args  Tool arguments (varies by tool)
 * @param repoPath  Root of the repository being analysed
 */
export async function executeLocalTool(
  name: string,
  args: Record<string, unknown>,
  repoPath: string,
): Promise<string> {
  switch (name) {
    case "Read":
      return executeRead(args, repoPath);
    case "Grep":
      return executeGrep(args, repoPath);
    case "Glob":
      return executeGlob(args, repoPath);
    default:
      return `Unknown tool: ${name}`;
  }
}

// ---------------------------------------------------------------------------
// Read — read a file (optionally a range of lines)
// ---------------------------------------------------------------------------

async function executeRead(
  args: Record<string, unknown>,
  repoPath: string,
): Promise<string> {
  const filePath = String(args["file_path"] ?? args["path"] ?? "");
  if (!filePath) return "Error: file_path is required";

  const resolved = safePath(filePath, repoPath);
  if (!resolved) return `Error: path "${filePath}" is outside the repository`;

  try {
    const content = await readFile(resolved, "utf-8");
    const lines = content.split("\n");

    const startLine =
      typeof args["start_line"] === "number" ? args["start_line"] : undefined;
    const endLine =
      typeof args["end_line"] === "number" ? args["end_line"] : undefined;

    if (startLine !== undefined || endLine !== undefined) {
      const start = Math.max(0, (startLine ?? 1) - 1);
      const end = endLine ?? lines.length;
      return lines.slice(start, end).join("\n");
    }

    // Cap at ~50 KB to avoid blowing up the context window
    if (content.length > 50_000) {
      return content.slice(0, 50_000) + "\n... (truncated, file too large)";
    }
    return content;
  } catch (err) {
    return `Error reading file: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ---------------------------------------------------------------------------
// Grep — search for a pattern across files
// ---------------------------------------------------------------------------

async function executeGrep(
  args: Record<string, unknown>,
  repoPath: string,
): Promise<string> {
  const pattern = String(args["pattern"] ?? "");
  if (!pattern) return "Error: pattern is required";

  const include = args["include"] ? String(args["include"]) : undefined;

  try {
    // Use grep -rn for recursive, line-numbered output
    const grepArgs = [
      "-rn",
      "--include",
      include ?? "*",
      "-m",
      "200",
      pattern,
      ".",
    ];
    const { stdout } = await execFileAsync("grep", grepArgs, {
      cwd: repoPath,
      maxBuffer: 1024 * 1024,
      timeout: 30_000,
    });
    return stdout.trim() || "No matches found.";
  } catch (err) {
    // grep returns exit code 1 for "no matches"
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: number }).code === 1
    ) {
      return "No matches found.";
    }
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ---------------------------------------------------------------------------
// Glob — list files matching a pattern
// ---------------------------------------------------------------------------

async function executeGlob(
  args: Record<string, unknown>,
  repoPath: string,
): Promise<string> {
  const pattern = String(args["pattern"] ?? args["glob"] ?? "");
  if (!pattern) return "Error: pattern is required";

  try {
    // Use find as a cross-platform-ish glob. For patterns like "**/*.ts"
    // we translate to find arguments.
    const findArgs = buildFindArgs(pattern);
    const { stdout } = await execFileAsync("find", [".", ...findArgs], {
      cwd: repoPath,
      maxBuffer: 1024 * 1024,
      timeout: 30_000,
    });
    const files = stdout.trim().split("\n").filter(Boolean).slice(0, 500); // cap results
    return files.length > 0 ? files.join("\n") : "No files matched.";
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/** Convert a simple glob pattern to `find` arguments. */
function buildFindArgs(pattern: string): string[] {
  // Strip leading **/ for recursive search
  const cleaned = pattern.replace(/^\*\*\//, "");
  if (cleaned.includes("*")) {
    return [
      "-name",
      cleaned,
      "-not",
      "-path",
      "*/node_modules/*",
      "-not",
      "-path",
      "*/.git/*",
    ];
  }
  // Treat as a directory prefix
  return [
    "-path",
    `./${pattern}`,
    "-not",
    "-path",
    "*/node_modules/*",
    "-not",
    "-path",
    "*/.git/*",
  ];
}

/** Resolve a file path safely within repoPath, preventing path traversal. */
function safePath(filePath: string, repoPath: string): string | null {
  const resolved = isAbsolute(filePath)
    ? filePath
    : resolve(repoPath, filePath);
  const rel = relative(repoPath, resolved);
  // Block path traversal
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return resolved;
}

// ---------------------------------------------------------------------------
// OpenAI function calling tool definitions
// ---------------------------------------------------------------------------

export const TOOL_DEFINITIONS_OPENAI = [
  {
    type: "function" as const,
    function: {
      name: "Read",
      description:
        "Read the contents of a file. Can optionally read a range of lines.",
      parameters: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "Path to the file to read (relative to repo root)",
          },
          start_line: {
            type: "number",
            description: "Start line (1-based, optional)",
          },
          end_line: {
            type: "number",
            description: "End line (1-based, inclusive, optional)",
          },
        },
        required: ["file_path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "Grep",
      description:
        "Search for a text pattern across files in the repository. Returns matching lines with file paths and line numbers.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Search pattern (basic regex supported)",
          },
          include: {
            type: "string",
            description: 'File glob to restrict search (e.g. "*.ts")',
          },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "Glob",
      description: "List files matching a glob pattern in the repository.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: 'Glob pattern (e.g. "**/*.ts", "src/**/*.test.ts")',
          },
        },
        required: ["pattern"],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Gemini function declaration tool definitions
// Uses parametersJsonSchema (JSON Schema format) to avoid fighting with the
// SDK's Type enum. This accepts `unknown` so plain objects work fine.
// ---------------------------------------------------------------------------

export const TOOL_DECLARATIONS_GEMINI = [
  {
    name: "Read",
    description:
      "Read the contents of a file. Can optionally read a range of lines.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Path to the file to read (relative to repo root)",
        },
        start_line: {
          type: "number",
          description: "Start line (1-based, optional)",
        },
        end_line: {
          type: "number",
          description: "End line (1-based, inclusive, optional)",
        },
      },
      required: ["file_path"],
    },
  },
  {
    name: "Grep",
    description:
      "Search for a text pattern across files in the repository. Returns matching lines with file paths and line numbers.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Search pattern (basic regex supported)",
        },
        include: {
          type: "string",
          description: 'File glob to restrict search (e.g. "*.ts")',
        },
      },
      required: ["pattern"],
    },
  },
  {
    name: "Glob",
    description: "List files matching a glob pattern in the repository.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: 'Glob pattern (e.g. "**/*.ts", "src/**/*.test.ts")',
        },
      },
      required: ["pattern"],
    },
  },
];
