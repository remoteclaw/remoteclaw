import crypto from "node:crypto";
import {
  resolveAgentDir,
  resolveAgentWorkspaceDir,
  resolveDefaultAgentId,
} from "../../agents/agent-scope.js";
import { loadConfig } from "../../config/config.js";
import { resolvePluginTools } from "../../plugins/tools.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

function resolveToolContext(rawAgentId: unknown) {
  const cfg = loadConfig();
  const agentId =
    typeof rawAgentId === "string" && rawAgentId.trim()
      ? rawAgentId.trim()
      : resolveDefaultAgentId(cfg);
  const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
  const agentDir = resolveAgentDir(cfg, agentId);
  return { cfg, agentId, workspaceDir, agentDir };
}

export const pluginToolsHandlers: GatewayRequestHandlers = {
  "plugin:tools:list": ({ params, respond }) => {
    try {
      const { cfg, agentId, workspaceDir, agentDir } = resolveToolContext(params.agentId);
      const tools = resolvePluginTools({
        context: { config: cfg, workspaceDir, agentDir, agentId },
        suppressNameConflicts: true,
      });
      const entries = tools.map((tool) => ({
        name: tool.name,
        description:
          typeof tool.description === "string" && tool.description.trim()
            ? tool.description.trim()
            : "Plugin tool",
        inputSchema:
          tool.parameters && typeof tool.parameters === "object"
            ? (tool.parameters as Record<string, unknown>)
            : { type: "object", properties: {} },
      }));
      respond(true, { agentId, tools: entries });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "plugin:tools:invoke": async ({ params, respond }) => {
    const toolName = typeof params.toolName === "string" ? params.toolName.trim() : "";
    if (!toolName) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "toolName required"));
      return;
    }
    try {
      const { cfg, agentId, workspaceDir, agentDir } = resolveToolContext(params.agentId);
      const sessionKey = typeof params.sessionKey === "string" ? params.sessionKey : undefined;
      const tools = resolvePluginTools({
        context: {
          config: cfg,
          workspaceDir,
          agentDir,
          agentId,
          sessionKey,
        },
        suppressNameConflicts: true,
      });
      const tool = tools.find((t) => t.name === toolName);
      if (!tool) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `plugin tool not found: ${toolName}`),
        );
        return;
      }
      const toolCallId = crypto.randomUUID();
      const toolParams = (params.params ?? {}) as Record<string, unknown>;
      const result = await tool.execute(toolCallId, toolParams);
      respond(true, {
        content: result.content,
        details: result.details,
      });
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
