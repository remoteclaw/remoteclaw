import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpHandlerContext } from "./mcp-handlers/context.js";
import { callMcpGateway } from "./mcp-handlers/session.js";

// ── JSON Schema → Zod conversion ────────────────────────────────────

/**
 * Converts a JSON Schema (as produced by TypeBox) into a Zod schema so the
 * MCP SDK can expose correct parameter definitions and validate input.
 *
 * Handles the common types that TypeBox produces. Anything unrecognised is
 * treated as `z.unknown()` so tool calls still work even if the schema uses
 * advanced features.
 */
function jsonSchemaPropertyToZod(schema: Record<string, unknown>): z.ZodTypeAny {
  if (Array.isArray(schema.enum)) {
    const values = schema.enum as [string, ...string[]];
    if (values.length > 0 && values.every((v) => typeof v === "string")) {
      return z.enum(values);
    }
    return z.any();
  }

  const type = schema.type;

  if (type === "string") {
    return z.string();
  }
  if (type === "number" || type === "integer") {
    return z.number();
  }
  if (type === "boolean") {
    return z.boolean();
  }
  if (type === "array") {
    const items = schema.items;
    if (items && typeof items === "object" && !Array.isArray(items)) {
      return z.array(jsonSchemaPropertyToZod(items as Record<string, unknown>));
    }
    return z.array(z.unknown());
  }
  if (type === "object") {
    return jsonSchemaToZodObject(schema);
  }

  // Fallback: accept anything so the tool remains callable.
  return z.any();
}

function jsonSchemaToZodObject(schema: Record<string, unknown>) {
  const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, propSchema] of Object.entries(properties)) {
    const zodType = jsonSchemaPropertyToZod(propSchema);
    shape[key] = required.has(key) ? zodType : zodType.optional();
  }
  return z.object(shape).passthrough();
}

// ── MCP tool registration ────────────────────────────────────────────

type PluginToolEntry = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

type PluginToolListResult = {
  agentId: string;
  tools: PluginToolEntry[];
};

/**
 * Fetches plugin-registered tools from the gateway and registers each one
 * as an MCP tool. Handlers delegate execution back to the gateway via
 * `plugin:tools:invoke`, keeping plugin closures intact.
 */
export async function registerPluginTools(
  server: McpServer,
  ctx: McpHandlerContext,
): Promise<void> {
  let result: PluginToolListResult;
  try {
    result = await callMcpGateway<PluginToolListResult>(ctx, "plugin:tools:list");
  } catch {
    // Gateway may not have plugins enabled — silently skip.
    return;
  }
  if (!result?.tools || !Array.isArray(result.tools)) {
    return;
  }
  for (const entry of result.tools) {
    const inputSchema = jsonSchemaToZodObject(entry.inputSchema);
    server.registerTool(
      entry.name,
      {
        description: entry.description,
        inputSchema,
      },
      async (args: Record<string, unknown>) => {
        const invokeResult = await callMcpGateway<{
          content?: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
          details?: unknown;
        }>(ctx, "plugin:tools:invoke", {
          toolName: entry.name,
          params: args,
          sessionKey: ctx.sessionKey,
        });
        const content = Array.isArray(invokeResult?.content) ? invokeResult.content : [];
        return {
          content: content.map((c) => {
            if (c.type === "image" && typeof c.data === "string") {
              return {
                type: "image" as const,
                data: c.data,
                mimeType: c.mimeType ?? "image/png",
              };
            }
            return { type: "text" as const, text: typeof c.text === "string" ? c.text : "" };
          }),
        };
      },
    );
  }
}
