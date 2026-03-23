/**
 * Stub for upstream before-tool-call hook infrastructure.
 *
 * The upstream pi-agent layer that implements loop detection and plugin
 * before_tool_call hooks has been gutted in the RemoteClaw fork. This stub
 * provides the minimal API surface that gateway code imports so cherry-picked
 * upstream fixes compile and run without the full pi-agent runtime.
 */

type HookContext = {
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
  runId?: string;
  loopDetection?: unknown;
};

type HookOutcome = { blocked: true; reason: string } | { blocked: false; params: unknown };

/**
 * No-op stub — always passes through the original params unblocked.
 */
export async function runBeforeToolCallHook(params: {
  toolName: string;
  params: unknown;
  toolCallId: string;
  ctx: HookContext;
}): Promise<HookOutcome> {
  return { blocked: false, params: params.params };
}
