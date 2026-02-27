import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpHandlerContext } from "./mcp-handlers/context.js";
import { registerCronTools } from "./mcp-handlers/cron.js";
import { registerGatewayTools } from "./mcp-handlers/gateway.js";
import { registerMessageTools } from "./mcp-handlers/message.js";
import { registerSessionTools } from "./mcp-handlers/session.js";

/**
 * Registers RemoteClaw-specific MCP tools on the given server.
 *
 * Tool categories:
 * - Session management (7 tools) — always registered
 * - Channel messaging (10 tools) — always registered
 * - Cron scheduling (7 tools) — owner-only
 * - Gateway admin (5 tools) — owner-only
 *
 * Owner-only tools (cron, gateway) are only registered when
 * `ctx.senderIsOwner` is `true`, preventing non-owner channel
 * users from accessing privileged operations.
 */
export function registerAllTools(server: McpServer, ctx: McpHandlerContext): void {
  registerSessionTools(server, ctx);
  registerMessageTools(server, ctx);
  if (ctx.senderIsOwner) {
    registerCronTools(server, ctx);
    registerGatewayTools(server, ctx);
  }
}
