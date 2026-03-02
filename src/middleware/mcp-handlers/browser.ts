import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpHandlerContext } from "./context.js";
import { callMcpGateway } from "./session.js";

// ── Browser Tools ───────────────────────────────────────────────────

/**
 * Registers browser automation MCP tools on the given server.
 *
 * Tools: browser_request.
 */
export function registerBrowserTools(server: McpServer, ctx: McpHandlerContext): void {
  server.registerTool(
    "browser_request",
    {
      description: "Proxy an HTTP request through a browser-capable node.",
      inputSchema: z.object({
        method: z.enum(["GET", "POST", "DELETE"]),
        path: z.string(),
        query: z.record(z.string(), z.unknown()).optional(),
        body: z.unknown().optional(),
        timeoutMs: z.number().optional(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "browser.request", {
        method: args.method,
        path: args.path,
        ...(args.query !== undefined ? { query: args.query } : {}),
        ...(args.body !== undefined ? { body: args.body } : {}),
        ...(args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {}),
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
