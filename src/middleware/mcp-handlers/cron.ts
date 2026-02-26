import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpHandlerContext } from "./context.js";
import { callMcpGateway } from "./session.js";

// ── Cron Tool Handlers ───────────────────────────────────────────────

/**
 * Registers all cron scheduling MCP tools on the given server.
 */
export function registerCronTools(server: McpServer, ctx: McpHandlerContext): void {
  // 1. cron_status — Check cron scheduler status
  server.registerTool(
    "cron_status",
    {
      description: "Check cron scheduler status.",
      inputSchema: z.object({}),
    },
    async () => {
      const result = await callMcpGateway(ctx, "cron.status", {});
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 2. cron_list — List cron jobs
  server.registerTool(
    "cron_list",
    {
      description: "List cron jobs.",
      inputSchema: z.object({
        filter: z.string().optional(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "cron.list", {
        includeDisabled: true,
        ...(args.filter !== undefined ? { filter: args.filter } : {}),
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 3. cron_add — Add a cron job (SIDE EFFECT)
  server.registerTool(
    "cron_add",
    {
      description: "Create a new cron job.",
      inputSchema: z.object({
        job: z.record(z.string(), z.unknown()),
      }),
    },
    async (args) => {
      const result = await callMcpGateway<Record<string, unknown>>(ctx, "cron.add", args.job);
      const jobId = typeof result?.id === "string" ? result.id : undefined;
      await ctx.sideEffects.recordCronAdd(jobId);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 4. cron_update — Update a cron job
  server.registerTool(
    "cron_update",
    {
      description: "Update a cron job.",
      inputSchema: z.object({
        jobId: z.string(),
        patch: z.record(z.string(), z.unknown()),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "cron.update", {
        id: args.jobId,
        patch: args.patch,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 5. cron_remove — Remove a cron job
  server.registerTool(
    "cron_remove",
    {
      description: "Remove a cron job.",
      inputSchema: z.object({
        jobId: z.string(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "cron.remove", { id: args.jobId });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 6. cron_run — Trigger a cron job immediately
  server.registerTool(
    "cron_run",
    {
      description: "Trigger a cron job immediately.",
      inputSchema: z.object({
        jobId: z.string(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "cron.run", {
        id: args.jobId,
        mode: "force",
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 7. cron_runs — Get run history for a cron job
  server.registerTool(
    "cron_runs",
    {
      description: "Get run history for a cron job.",
      inputSchema: z.object({
        jobId: z.string(),
        limit: z.number().optional(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "cron.runs", {
        id: args.jobId,
        ...(args.limit !== undefined ? { limit: args.limit } : {}),
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
