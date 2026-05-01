import { getGlobalHookRunner } from "../../plugins/hook-runner-global.js";
import type { GatewayRequestHandlers } from "./types.js";

export const toolHooksHandlers: GatewayRequestHandlers = {
  "hooks.tool.before": async ({ params, respond }) => {
    const hookRunner = getGlobalHookRunner();
    if (!hookRunner) {
      respond(true, {});
      return;
    }
    const toolName = typeof params.toolName === "string" ? params.toolName : "";
    const toolParams = (params.params ?? {}) as Record<string, unknown>;
    const result = await hookRunner.runBeforeToolCall(
      { toolName, params: toolParams },
      { toolName },
    );
    respond(true, result ?? {});
  },

  "hooks.tool.after": async ({ params, respond }) => {
    const hookRunner = getGlobalHookRunner();
    if (!hookRunner) {
      respond(true, {});
      return;
    }
    const toolName = typeof params.toolName === "string" ? params.toolName : "";
    const toolParams = (params.params ?? {}) as Record<string, unknown>;
    const durationMs = typeof params.durationMs === "number" ? params.durationMs : undefined;
    const error = typeof params.error === "string" ? params.error : undefined;
    await hookRunner.runAfterToolCall(
      { toolName, params: toolParams, durationMs, error },
      { toolName },
    );
    respond(true, {});
  },
};
