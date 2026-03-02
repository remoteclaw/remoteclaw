import crypto from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpHandlerContext } from "./context.js";
import { callMcpGateway } from "./session.js";

// ── Node Tools ──────────────────────────────────────────────────────

/**
 * Registers node management MCP tools on the given server.
 *
 * Tools: node_list, node_describe, node_invoke, node_rename,
 *        node_pair_list, node_pair_approve, node_pair_reject.
 */
export function registerNodeTools(server: McpServer, ctx: McpHandlerContext): void {
  server.registerTool(
    "node_list",
    {
      description: "List connected and paired nodes.",
      inputSchema: z.object({}),
    },
    async () => {
      const result = await callMcpGateway(ctx, "node.list", {});
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "node_describe",
    {
      description: "Get detailed information about a specific node.",
      inputSchema: z.object({
        nodeId: z.string(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "node.describe", {
        nodeId: args.nodeId,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "node_invoke",
    {
      description: "Execute a command on a connected node.",
      inputSchema: z.object({
        nodeId: z.string(),
        command: z.string(),
        params: z.unknown().optional(),
        timeoutMs: z.number().optional(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "node.invoke", {
        nodeId: args.nodeId,
        command: args.command,
        params: args.params,
        timeoutMs: args.timeoutMs,
        idempotencyKey: crypto.randomUUID(),
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "node_rename",
    {
      description: "Rename a paired node.",
      inputSchema: z.object({
        nodeId: z.string(),
        displayName: z.string(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "node.rename", {
        nodeId: args.nodeId,
        displayName: args.displayName,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "node_pair_list",
    {
      description: "List pending and completed node pairing requests.",
      inputSchema: z.object({}),
    },
    async () => {
      const result = await callMcpGateway(ctx, "node.pair.list", {});
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "node_pair_approve",
    {
      description: "Approve a pending node pairing request.",
      inputSchema: z.object({
        requestId: z.string(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "node.pair.approve", {
        requestId: args.requestId,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "node_pair_reject",
    {
      description: "Reject a pending node pairing request.",
      inputSchema: z.object({
        requestId: z.string(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "node.pair.reject", {
        requestId: args.requestId,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
