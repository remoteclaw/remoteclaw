import { describe, expect, it } from "vitest";
import "./app.ts"; // registers the "remoteclaw-app" custom element

// Defense-in-depth against the sync regression class fixed in #2493: fixtures
// matched the LifecycleHost/GatewayHost/ToolStreamHost interfaces while the
// production `RemoteClawApp` class did not. These smoke tests instantiate the
// real class and assert every required host-interface field is defined.

function createApp(): Record<string, unknown> {
  return document.createElement("remoteclaw-app") as unknown as Record<string, unknown>;
}

function assertAllDefined(
  instance: Record<string, unknown>,
  fields: readonly string[],
  label: string,
) {
  for (const field of fields) {
    expect(instance[field], `missing ${label} field: ${field}`).not.toBeUndefined();
  }
}

const LIFECYCLE_HOST_FIELDS = [
  "basePath",
  "connectGeneration",
  "tab",
  "assistantName",
  "assistantAvatar",
  "assistantAgentId",
  "serverVersion",
  "chatHasAutoScrolled",
  "chatManualRefreshInFlight",
  "chatLoading",
  "chatMessages",
  "chatToolMessages",
  "chatStream",
  "logsAutoFollow",
  "logsAtBottom",
  "logsEntries",
  "popStateHandler",
  "topbarObserver",
] as const;

const GATEWAY_HOST_FIELDS = [
  "settings",
  "password",
  "clientInstanceId",
  "client",
  "connected",
  "hello",
  "lastError",
  "lastErrorCode",
  "eventLogBuffer",
  "eventLog",
  "tab",
  "presenceEntries",
  "presenceError",
  "presenceStatus",
  "agentsLoading",
  "agentsList",
  "agentsError",
  "toolsCatalogLoading",
  "toolsCatalogError",
  "toolsCatalogResult",
  "debugHealth",
  "assistantName",
  "assistantAvatar",
  "assistantAgentId",
  "serverVersion",
  "sessionKey",
  "chatRunId",
  "refreshSessionsAfterChat",
  "execApprovalQueue",
  "execApprovalError",
  "updateAvailable",
] as const;

const TOOL_STREAM_HOST_FIELDS = [
  "sessionKey",
  "chatRunId",
  "chatStream",
  "chatStreamStartedAt",
  "chatStreamSegments",
  "toolStreamById",
  "toolStreamOrder",
  "chatToolMessages",
  "toolStreamSyncTimer",
] as const;

describe("RemoteClawApp instance — host interface compliance", () => {
  it("initializes every required LifecycleHost field", () => {
    const app = createApp();
    assertAllDefined(app, LIFECYCLE_HOST_FIELDS, "LifecycleHost");
  });

  it("initializes every required GatewayHost field", () => {
    const app = createApp();
    assertAllDefined(app, GATEWAY_HOST_FIELDS, "GatewayHost");
  });

  it("initializes every required ToolStreamHost field", () => {
    const app = createApp();
    assertAllDefined(app, TOOL_STREAM_HOST_FIELDS, "ToolStreamHost");
  });
});
