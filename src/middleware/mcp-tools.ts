import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerBrowserTools } from "./mcp-handlers/browser.js";
import { registerCanvasTools } from "./mcp-handlers/canvas.js";
import type { McpHandlerContext } from "./mcp-handlers/context.js";
import { registerCronTools } from "./mcp-handlers/cron.js";
import { registerGatewayTools } from "./mcp-handlers/gateway.js";
import { registerMessageTools } from "./mcp-handlers/message.js";
import { registerNodeTools } from "./mcp-handlers/nodes.js";
import { callMcpGateway, registerSessionTools } from "./mcp-handlers/session.js";
import { registerTtsTools } from "./mcp-handlers/tts.js";
import { registerPluginTools } from "./mcp-plugin-tools.js";

/**
 * Wraps an MCP server so every registered tool fires `before_tool_call` /
 * `after_tool_call` plugin hooks via gateway RPC. Both hook calls are
 * fire-and-forget (`.catch(() => {})`) so they never block tool execution.
 */
function wrapWithToolHooks(server: McpServer, ctx: McpHandlerContext): McpServer {
  const orig = server.registerTool.bind(server);
  return new Proxy(server, {
    get(target, prop, receiver) {
      if (prop !== "registerTool") {
        return Reflect.get(target, prop, receiver);
      }
      // oxlint-disable-next-line typescript/no-explicit-any
      return (...registerArgs: any[]) => {
        const toolName = registerArgs[0] as string;
        const lastIdx = registerArgs.length - 1;
        const handler = registerArgs[lastIdx];
        if (typeof handler === "function") {
          // oxlint-disable-next-line typescript/no-explicit-any
          registerArgs[lastIdx] = async (...handlerArgs: any[]) => {
            const start = Date.now();
            const params = handlerArgs[0] as Record<string, unknown>;
            callMcpGateway(ctx, "hooks.tool.before", { toolName, params }).catch(() => {});
            try {
              // oxlint-disable-next-line typescript/no-explicit-any
              const result = await (handler as (...a: any[]) => Promise<unknown>)(...handlerArgs);
              callMcpGateway(ctx, "hooks.tool.after", {
                toolName,
                params,
                durationMs: Date.now() - start,
              }).catch(() => {});
              return result;
            } catch (err) {
              callMcpGateway(ctx, "hooks.tool.after", {
                toolName,
                params,
                durationMs: Date.now() - start,
                error: String(err),
              }).catch(() => {});
              throw err;
            }
          };
        }
        // oxlint-disable-next-line typescript/no-explicit-any
        return (orig as (...a: any[]) => unknown)(...registerArgs);
      };
    },
  });
}

/**
 * Registers RemoteClaw-specific MCP tools on the given server.
 *
 * Tool categories:
 * - Session management (7 tools) — always registered
 * - Channel messaging (10 tools) — always registered
 * - Cron scheduling (7 tools) — owner-only
 * - Gateway admin (5 tools) — owner-only
 * - Node management (7 tools) — owner-only
 * - Canvas (7 tools) — owner-only
 * - Browser proxy (1 tool) — owner-only
 * - TTS (6 tools) — owner-only
 *
 * Owner-only tools are only registered when `ctx.senderIsOwner`
 * is `true`, preventing non-owner channel users from accessing
 * privileged operations.
 *
 * All tools are wrapped with before_tool_call / after_tool_call
 * hook firing via gateway RPC.
 */
export async function registerAllTools(server: McpServer, ctx: McpHandlerContext): Promise<void> {
  const hooked = wrapWithToolHooks(server, ctx);
  registerSessionTools(hooked, ctx);
  registerMessageTools(hooked, ctx);
  if (ctx.senderIsOwner) {
    registerCronTools(hooked, ctx);
    registerGatewayTools(hooked, ctx);
    registerNodeTools(hooked, ctx);
    registerCanvasTools(hooked, ctx);
    registerBrowserTools(hooked, ctx);
    registerTtsTools(hooked, ctx);
  }
  await registerPluginTools(hooked, ctx);
}
