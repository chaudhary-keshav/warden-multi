/**
 * Local tool execution for non-Claude providers.
 *
 * Warden's analysis gives the LLM three read-only tools: Read, Grep, Glob.
 * Claude Code SDK executes these in its subprocess automatically.
 * For OpenAI / Gemini, we must execute them ourselves in response to
 * function-calling tool_calls, then feed results back to the model.
 */
/**
 * Run a Warden tool locally and return the string result.
 *
 * @param name  Tool name: Read, Grep, or Glob
 * @param args  Tool arguments (varies by tool)
 * @param repoPath  Root of the repository being analysed
 */
export declare function executeLocalTool(name: string, args: Record<string, unknown>, repoPath: string): Promise<string>;
export declare const TOOL_DEFINITIONS_OPENAI: ({
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                file_path: {
                    type: string;
                    description: string;
                };
                start_line: {
                    type: string;
                    description: string;
                };
                end_line: {
                    type: string;
                    description: string;
                };
                pattern?: undefined;
                include?: undefined;
            };
            required: string[];
        };
    };
} | {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                pattern: {
                    type: string;
                    description: string;
                };
                include: {
                    type: string;
                    description: string;
                };
                file_path?: undefined;
                start_line?: undefined;
                end_line?: undefined;
            };
            required: string[];
        };
    };
} | {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: {
            type: string;
            properties: {
                pattern: {
                    type: string;
                    description: string;
                };
                file_path?: undefined;
                start_line?: undefined;
                end_line?: undefined;
                include?: undefined;
            };
            required: string[];
        };
    };
})[];
export declare const TOOL_DECLARATIONS_GEMINI: ({
    name: string;
    description: string;
    parametersJsonSchema: {
        type: string;
        properties: {
            file_path: {
                type: string;
                description: string;
            };
            start_line: {
                type: string;
                description: string;
            };
            end_line: {
                type: string;
                description: string;
            };
            pattern?: undefined;
            include?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    parametersJsonSchema: {
        type: string;
        properties: {
            pattern: {
                type: string;
                description: string;
            };
            include: {
                type: string;
                description: string;
            };
            file_path?: undefined;
            start_line?: undefined;
            end_line?: undefined;
        };
        required: string[];
    };
} | {
    name: string;
    description: string;
    parametersJsonSchema: {
        type: string;
        properties: {
            pattern: {
                type: string;
                description: string;
            };
            file_path?: undefined;
            start_line?: undefined;
            end_line?: undefined;
            include?: undefined;
        };
        required: string[];
    };
})[];
//# sourceMappingURL=tools.d.ts.map