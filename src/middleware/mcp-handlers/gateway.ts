import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpHandlerContext } from "./context.js";
import { callMcpGateway } from "./session.js";

// ── Gateway Admin Tools ──────────────────────────────────────────────

/**
 * Registers gateway administration MCP tools on the given server.
 *
 * Tools: gateway_restart, gateway_config_get, gateway_config_apply,
 *        gateway_config_patch, gateway_config_schema.
 */
export function registerGatewayTools(server: McpServer, ctx: McpHandlerContext): void {
  server.registerTool(
    "gateway_restart",
    {
      description: "Restart the gateway process.",
      inputSchema: z.object({}),
    },
    async () => {
      const result = await callMcpGateway(ctx, "gateway:restart", {});
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "gateway_config_get",
    {
      description: "Get gateway configuration. Optionally filter by key.",
      inputSchema: z.object({
        key: z.string().optional(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "gateway:config.get", {
        key: args.key,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "gateway_config_apply",
    {
      description:
        "Apply a full gateway configuration object, replacing the current configuration.",
      inputSchema: z.object({
        config: z.object({}).passthrough(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "gateway:config.apply", {
        config: args.config,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "gateway_config_patch",
    {
      description: "Patch the gateway configuration with a partial update.",
      inputSchema: z.object({
        patches: z.object({}).passthrough(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "gateway:config.patch", {
        patches: args.patches,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "gateway_config_schema",
    {
      description: "Get the JSON schema for gateway configuration.",
      inputSchema: z.object({}),
    },
    async () => {
      const result = await callMcpGateway(ctx, "gateway:config.schema", {});
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
