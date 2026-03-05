import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpHandlerContext } from "./context.js";

// ── Heartbeat Tools ──────────────────────────────────────────────────

/**
 * Registers the heartbeat_report MCP tool on the given server.
 *
 * This tool replaces the fragile HEARTBEAT_OK text protocol with a
 * structured tool call. The middleware appends a non-configurable suffix
 * to the heartbeat prompt instructing the agent to use this tool.
 *
 * Unconditionally registered (always available, regardless of owner status).
 */
export function registerHeartbeatTools(server: McpServer, ctx: McpHandlerContext): void {
  server.registerTool(
    "heartbeat_report",
    {
      description:
        "Report the result of a heartbeat check. Call this at the end of a heartbeat run " +
        "to indicate whether any actions were taken.",
      inputSchema: z.object({
        anything_done: z
          .boolean()
          .describe(
            "true if any actions were performed or alerts need attention; " +
              "false if nothing needs user-facing follow-up.",
          ),
        summary: z
          .string()
          .nullable()
          .optional()
          .describe(
            "Optional summary of what was done or observed. " +
              "When anything_done is true, this is delivered to the channel. " +
              "When anything_done is false, this is only shown if showOk is enabled.",
          ),
      }),
    },
    async (args) => {
      await ctx.sideEffects.recordHeartbeatReport({
        anythingDone: args.anything_done,
        summary: args.summary ?? null,
      });

      if (args.anything_done) {
        return {
          content: [
            {
              type: "text" as const,
              text: args.summary
                ? `Heartbeat reported: actions taken. Summary will be delivered to the channel.`
                : `Heartbeat reported: actions taken. A default summary will be delivered.`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: args.summary
              ? `Heartbeat reported: nothing to do. Summary recorded.`
              : `Heartbeat reported: nothing to do.`,
          },
        ],
      };
    },
  );
}
