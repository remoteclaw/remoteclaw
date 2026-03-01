import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { McpHandlerContext } from "./mcp-handlers/context.js";
import { McpSideEffectsWriter } from "./mcp-side-effects.js";
import { registerAllTools } from "./mcp-tools.js";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function createContext(): McpHandlerContext {
  return {
    gatewayUrl: requiredEnv("REMOTECLAW_GATEWAY_URL"),
    gatewayToken: requiredEnv("REMOTECLAW_GATEWAY_TOKEN"),
    sessionKey: requiredEnv("REMOTECLAW_SESSION_KEY"),
    sideEffects: new McpSideEffectsWriter(requiredEnv("REMOTECLAW_SIDE_EFFECTS_FILE")),
    channel: process.env.REMOTECLAW_CHANNEL ?? "",
    accountId: process.env.REMOTECLAW_ACCOUNT_ID ?? "",
    to: process.env.REMOTECLAW_TO ?? "",
    threadId: process.env.REMOTECLAW_THREAD_ID ?? "",
    senderIsOwner: process.env.REMOTECLAW_SENDER_IS_OWNER === "true",
    toolProfile: process.env.REMOTECLAW_TOOL_PROFILE || "full",
  };
}

async function main(): Promise<void> {
  const ctx = createContext();

  const server = new McpServer({
    name: "remoteclaw",
    version: "1.0.0",
  });

  await registerAllTools(server, ctx);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`remoteclaw-mcp-server fatal: ${err}\n`);
  process.exit(1);
});
