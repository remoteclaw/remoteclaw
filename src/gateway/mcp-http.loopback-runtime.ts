export type McpLoopbackRuntime = {
  port: number;
  token: string;
};

let activeRuntime: McpLoopbackRuntime | undefined;

export function getActiveMcpLoopbackRuntime(): McpLoopbackRuntime | undefined {
  return activeRuntime ? { ...activeRuntime } : undefined;
}

export function setActiveMcpLoopbackRuntime(runtime: McpLoopbackRuntime): void {
  activeRuntime = { ...runtime };
}

export function clearActiveMcpLoopbackRuntime(token: string): void {
  if (activeRuntime?.token === token) {
    activeRuntime = undefined;
  }
}

export function createMcpLoopbackServerConfig(port: number) {
  return {
    mcpServers: {
      remoteclaw: {
        type: "http",
        url: `http://127.0.0.1:${port}/mcp`,
        headers: {
          Authorization: "Bearer ${REMOTECLAW_MCP_TOKEN}",
          "x-session-key": "${REMOTECLAW_MCP_SESSION_KEY}",
          "x-remoteclaw-agent-id": "${REMOTECLAW_MCP_AGENT_ID}",
          "x-remoteclaw-account-id": "${REMOTECLAW_MCP_ACCOUNT_ID}",
          "x-remoteclaw-message-channel": "${REMOTECLAW_MCP_MESSAGE_CHANNEL}",
          "x-remoteclaw-sender-is-owner": "${REMOTECLAW_MCP_SENDER_IS_OWNER}",
        },
      },
    },
  };
}
