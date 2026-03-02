import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { callGateway } from "../../gateway/call.js";
import { resolveLeastPrivilegeOperatorScopesForMethod } from "../../gateway/method-scopes.js";
import { GATEWAY_CLIENT_MODES, GATEWAY_CLIENT_NAMES } from "../../utils/message-channel.js";
import type { McpHandlerContext } from "./context.js";

// ── Gateway helper ───────────────────────────────────────────────────

/**
 * Call the gateway with least-privilege scopes for the given method.
 * Shared by all session MCP handlers (and exported for other handler modules).
 */
export async function callMcpGateway<T>(
  ctx: McpHandlerContext,
  method: string,
  params?: unknown,
): Promise<T> {
  const scopes = resolveLeastPrivilegeOperatorScopesForMethod(method);
  const result = await callGateway<T>({
    url: ctx.gatewayUrl,
    token: ctx.gatewayToken,
    method,
    params,
    timeoutMs: 30_000,
    clientName: GATEWAY_CLIENT_NAMES.GATEWAY_CLIENT,
    clientDisplayName: "mcp-server",
    mode: GATEWAY_CLIENT_MODES.BACKEND,
    scopes,
  });
  return result as T;
}

// ── Session tool registration ────────────────────────────────────────

/**
 * Register all session-management MCP tools on the given server.
 */
export function registerSessionTools(server: McpServer, ctx: McpHandlerContext): void {
  // 1. sessions_list ───────────────────────────────────────────────────
  server.registerTool(
    "sessions_list",
    {
      description: "List active sessions with optional filters.",
      inputSchema: z.object({
        filter: z.string().optional(),
        limit: z.number().optional(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "sessions.list", {
        limit: args.filter !== undefined ? undefined : args.limit,
        search: args.filter,
        includeGlobal: true,
        includeUnknown: true,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 2. sessions_history ────────────────────────────────────────────────
  server.registerTool(
    "sessions_history",
    {
      description: "Get chat history for a session.",
      inputSchema: z.object({
        sessionKey: z.string(),
        limit: z.number().optional(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "chat.history", {
        sessionKey: args.sessionKey,
        limit: args.limit,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 3. sessions_send ───────────────────────────────────────────────────
  server.registerTool(
    "sessions_send",
    {
      description:
        "Send a message to another session. Use sessionKey or label to identify the target.",
      inputSchema: z.object({
        sessionKey: z.string().optional(),
        label: z.string().optional(),
        message: z.string(),
        timeout: z.number().optional(),
      }),
    },
    async (args) => {
      const sessionKey = args.sessionKey ?? args.label;
      const timeoutMs = (args.timeout ?? 30) * 1000;

      // Send message
      const sendResult = await callMcpGateway<{ runId?: string }>(ctx, "agent", {
        message: args.message,
        sessionKey,
        deliver: false,
        channel: "internal",
      });
      const runId = sendResult?.runId;

      // Record side effect
      await ctx.sideEffects.recordMessageSent({
        tool: "sessions_send",
        provider: ctx.channel,
        accountId: ctx.accountId,
        to: sessionKey ?? "",
        text: args.message,
      });

      // If timeout is 0, return immediately
      if (args.timeout === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ runId, status: "accepted" }, null, 2),
            },
          ],
        };
      }

      // Wait for reply
      try {
        const waitResult = await callMcpGateway<{ status?: string; error?: string }>(
          ctx,
          "agent.wait",
          {
            runId,
            timeoutMs,
          },
        );

        // Get the reply from history
        const history = await callMcpGateway<{ messages?: unknown[] }>(ctx, "chat.history", {
          sessionKey,
          limit: 5,
        });
        const messages = Array.isArray(history?.messages) ? history.messages : [];
        const last = messages[messages.length - 1];
        const reply =
          last && typeof last === "object" && "content" in (last as Record<string, unknown>)
            ? String((last as Record<string, unknown>).content)
            : undefined;

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  runId,
                  status: waitResult?.status ?? "ok",
                  reply,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ runId, status: "error", error: message }, null, 2),
            },
          ],
        };
      }
    },
  );

  // 4. sessions_spawn ──────────────────────────────────────────────────
  server.registerTool(
    "sessions_spawn",
    {
      description: "Spawn a sub-agent session to handle a delegated task.",
      inputSchema: z.object({
        task: z.string(),
        agentId: z.string().optional(),
        label: z.string().optional(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "sessions.spawn", {
        task: args.task,
        agentId: args.agentId,
        label: args.label,
        sessionKey: ctx.sessionKey,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 5. session_status ──────────────────────────────────────────────────
  server.registerTool(
    "session_status",
    {
      description: "Get the current status of a session.",
      inputSchema: z.object({
        sessionKey: z.string().optional(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "status", {
        sessionKey: args.sessionKey ?? ctx.sessionKey,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 6. agents_list ─────────────────────────────────────────────────────
  server.registerTool(
    "agents_list",
    {
      description: "List all configured agents.",
      inputSchema: z.object({}),
    },
    async () => {
      const result = await callMcpGateway(ctx, "agents.list");
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 7. subagents ───────────────────────────────────────────────────────
  server.registerTool(
    "subagents",
    {
      description: "Manage sub-agents (list, status, cancel, etc.).",
      inputSchema: z.object({
        action: z.string(),
        params: z.record(z.string(), z.unknown()).optional(),
      }),
    },
    async (args) => {
      const result = await callMcpGateway(ctx, "sessions.subagents", {
        action: args.action,
        ...args.params,
        sessionKey: ctx.sessionKey,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
