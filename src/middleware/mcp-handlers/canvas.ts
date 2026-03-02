import crypto from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpHandlerContext } from "./context.js";
import { callMcpGateway } from "./session.js";

// ── Canvas Tools ────────────────────────────────────────────────────

/**
 * Registers canvas MCP tools on the given server.
 *
 * All canvas tools are thin wrappers around `node.invoke` with
 * pre-filled canvas-specific commands.
 *
 * Tools: canvas_present, canvas_hide, canvas_navigate, canvas_eval,
 *        canvas_snapshot, canvas_a2ui_push, canvas_a2ui_reset.
 */
export function registerCanvasTools(server: McpServer, ctx: McpHandlerContext): void {
  server.registerTool(
    "canvas_present",
    {
      description: "Show the canvas on a node, optionally with a target URL and placement.",
      inputSchema: z.object({
        nodeId: z.string(),
        url: z.string().optional(),
        x: z.number().optional(),
        y: z.number().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
      }),
    },
    async (args) => {
      const params: Record<string, unknown> = {};
      if (args.url !== undefined) {
        params.url = args.url;
      }
      const placement = {
        x: args.x,
        y: args.y,
        width: args.width,
        height: args.height,
      };
      if (
        Number.isFinite(placement.x) ||
        Number.isFinite(placement.y) ||
        Number.isFinite(placement.width) ||
        Number.isFinite(placement.height)
      ) {
        params.placement = placement;
      }
      const result = await callMcpGateway(ctx, "node.invoke", {
        nodeId: args.nodeId,
        command: "canvas.present",
        params,
        idempotencyKey: crypto.randomUUID(),
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "canvas_hide",
    {
      description: "Hide the canvas on a node.",
      inputSchema: z.object({
        nodeId: z.string(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "node.invoke", {
        nodeId: args.nodeId,
        command: "canvas.hide",
        idempotencyKey: crypto.randomUUID(),
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "canvas_navigate",
    {
      description: "Navigate the canvas to a URL.",
      inputSchema: z.object({
        nodeId: z.string(),
        url: z.string(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "node.invoke", {
        nodeId: args.nodeId,
        command: "canvas.navigate",
        params: { url: args.url },
        idempotencyKey: crypto.randomUUID(),
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "canvas_eval",
    {
      description: "Evaluate JavaScript in the canvas.",
      inputSchema: z.object({
        nodeId: z.string(),
        javaScript: z.string(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "node.invoke", {
        nodeId: args.nodeId,
        command: "canvas.eval",
        params: { javaScript: args.javaScript },
        idempotencyKey: crypto.randomUUID(),
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "canvas_snapshot",
    {
      description: "Capture a snapshot of the canvas.",
      inputSchema: z.object({
        nodeId: z.string(),
        format: z.enum(["png", "jpg", "jpeg"]).optional(),
        maxWidth: z.number().optional(),
        quality: z.number().optional(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "node.invoke", {
        nodeId: args.nodeId,
        command: "canvas.snapshot",
        params: {
          format: args.format,
          maxWidth: args.maxWidth,
          quality: args.quality,
        },
        idempotencyKey: crypto.randomUUID(),
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "canvas_a2ui_push",
    {
      description: "Push A2UI JSONL content to the canvas.",
      inputSchema: z.object({
        nodeId: z.string(),
        jsonl: z.string(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "node.invoke", {
        nodeId: args.nodeId,
        command: "canvas.a2ui.pushJSONL",
        params: { jsonl: args.jsonl },
        idempotencyKey: crypto.randomUUID(),
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "canvas_a2ui_reset",
    {
      description: "Reset the A2UI renderer state on a node.",
      inputSchema: z.object({
        nodeId: z.string(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "node.invoke", {
        nodeId: args.nodeId,
        command: "canvas.a2ui.reset",
        idempotencyKey: crypto.randomUUID(),
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
