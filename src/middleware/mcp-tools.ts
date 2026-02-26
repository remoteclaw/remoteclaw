import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpHandlerContext } from "./mcp-handlers/context.js";
import { registerCronTools } from "./mcp-handlers/cron.js";
import { registerGatewayTools } from "./mcp-handlers/gateway.js";
import { registerMessageTools } from "./mcp-handlers/message.js";
import { registerSessionTools } from "./mcp-handlers/session.js";

/**
 * Registers all 29 RemoteClaw-specific MCP tools on the given server.
 *
 * Tool categories:
 * - Session management (7 tools)
 * - Channel messaging (10 tools)
 * - Cron scheduling (7 tools)
 * - Gateway admin (5 tools)
 */
export function registerAllTools(server: McpServer, ctx: McpHandlerContext): void {
  registerSessionTools(server, ctx);
  registerMessageTools(server, ctx);
  registerCronTools(server, ctx);
  registerGatewayTools(server, ctx);
}
