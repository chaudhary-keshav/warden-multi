/**
 * Local MCP client for connecting to MCP servers.
 *
 * Spawns MCP servers as stdio subprocesses, discovers their tools,
 * converts tool schemas to OpenAI/Gemini function-calling format,
 * and routes tool calls to the appropriate MCP subprocess.
 *
 * This enables MCP tool use across ALL providers (Claude, OpenAI, Gemini),
 * not just those with native MCP support.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { McpServerConfig, OpenAIToolDefinition, GeminiToolDeclaration } from "./types.js";

/**
 * A connected MCP server with its discovered tools.
 */
interface ConnectedServer {
  client: Client;
  transport: StdioClientTransport;
  tools: McpTool[];
  serverName: string;
}

/**
 * An MCP tool with its schema, ready for use.
 */
export interface McpTool {
  /** Prefixed name: mcp_{serverName}_{toolName} */
  name: string;
  /** Original tool name from the MCP server */
  originalName: string;
  /** Server this tool belongs to */
  serverName: string;
  description: string;
  /** JSON Schema for the tool's input parameters */
  inputSchema: Record<string, unknown>;
}

/**
 * Manages connections to multiple MCP servers.
 * Handles lifecycle (connect, discover tools, call tools, close).
 */
export class McpClientManager {
  private servers: ConnectedServer[] = [];
  private connected = false;

  constructor(
    private readonly serverConfigs: Record<string, McpServerConfig>,
  ) {}

  /**
   * Connect to all configured MCP servers and discover their tools.
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    for (const [serverName, config] of Object.entries(this.serverConfigs)) {
      try {
        const server = await this.connectServer(serverName, config);
        this.servers.push(server);
      } catch (error) {
        // Log but don't fail — MCP is optional enhancement
        console.error(
          `::warning::Failed to connect MCP server '${serverName}': ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.connected = true;
  }

  /**
   * Connect to a single MCP server.
   */
  private async connectServer(
    serverName: string,
    config: McpServerConfig,
  ): Promise<ConnectedServer> {
    if (config.type === "sse" || config.type === "http") {
      throw new Error(
        `MCP server '${serverName}' uses ${config.type} transport which is not yet supported for local clients. Use stdio.`,
      );
    }

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            (entry): entry is [string, string] => entry[1] !== undefined,
          ),
        ),
        ...config.env,
      },
    });

    const client = new Client({
      name: "warden",
      version: "1.0.0",
    });

    await client.connect(transport);

    // Discover available tools
    const toolsResult = await client.listTools();
    const tools: McpTool[] = (toolsResult.tools ?? []).map((tool) => ({
      name: `mcp_${serverName}_${tool.name}`,
      originalName: tool.name,
      serverName,
      description: tool.description ?? "",
      inputSchema: (tool.inputSchema as Record<string, unknown>) ?? {
        type: "object",
        properties: {},
      },
    }));

    return { client, transport, tools, serverName };
  }

  /**
   * Get all discovered MCP tools across all connected servers.
   */
  getTools(): McpTool[] {
    return this.servers.flatMap((s) => s.tools);
  }

  /**
   * Check if a tool name is an MCP tool.
   */
  isMcpTool(name: string): boolean {
    return this.getTools().some((t) => t.name === name);
  }

  /**
   * Call an MCP tool by its prefixed name.
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const tool = this.getTools().find((t) => t.name === name);
    if (!tool) {
      return `Error: Unknown MCP tool '${name}'`;
    }

    const server = this.servers.find((s) => s.serverName === tool.serverName);
    if (!server) {
      return `Error: MCP server '${tool.serverName}' not connected`;
    }

    try {
      const result = await server.client.callTool({
        name: tool.originalName,
        arguments: args,
      });

      // Extract text content from MCP result
      if (Array.isArray(result.content)) {
        return result.content
          .filter((c): c is { type: "text"; text: string } => c.type === "text")
          .map((c) => c.text)
          .join("\n");
      }

      return typeof result.content === "string"
        ? result.content
        : JSON.stringify(result.content);
    } catch (error) {
      return `Error calling MCP tool '${name}': ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Get MCP tools in OpenAI function-calling format.
   */
  getOpenAIToolDefinitions(): OpenAIToolDefinition[] {
    return this.getTools().map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }

  /**
   * Get MCP tools in Gemini function declaration format.
   */
  getGeminiToolDeclarations(): GeminiToolDeclaration[] {
    return this.getTools().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parametersJsonSchema: tool.inputSchema,
    }));
  }

  /**
   * Get MCP tools as Claude SDK mcpServers config (for native passthrough).
   */
  getMcpServersForClaude(): Record<string, McpServerConfig> {
    const result: Record<string, McpServerConfig> = {};
    for (const [name, config] of Object.entries(this.serverConfigs)) {
      result[name] = config;
    }
    return result;
  }

  /**
   * Close all MCP server connections.
   */
  async close(): Promise<void> {
    for (const server of this.servers) {
      try {
        await server.client.close();
      } catch {
        // Ignore close errors
      }
    }
    this.servers = [];
    this.connected = false;
  }
}
