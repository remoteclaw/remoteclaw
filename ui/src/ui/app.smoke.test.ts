import { describe, expect, it } from "vitest";
import "./app.ts"; // registers the "remoteclaw-app" custom element

// Defense-in-depth against the sync regression class fixed in #2493: fixtures
// matched the LifecycleHost/GatewayHost/ToolStreamHost interfaces while the
// production `RemoteClawApp` class did not. These smoke tests instantiate the
// real class and assert every required host-interface field is defined.
// Extended in #2496 to cover PollingHost / ChatHost / ScrollHost / SettingsHost
// / CompactionHost — the remaining interfaces the class is asserted against.

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

// Extended coverage (#2496): audit scope broadened to the remaining host
// interfaces the class is asserted against. After #2494 removed the
// `as unknown as Parameters<typeof X>[0]` casts, tsc surfaces missing fields
// as compile errors — but runtime assertions still catch regressions in
// fixture-based tests that bypass the class.

const POLLING_HOST_FIELDS = [
  "nodesPollInterval",
  "logsPollInterval",
  "debugPollInterval",
  "tab",
] as const;

const CHAT_HOST_FIELDS = [
  "connected",
  "chatMessage",
  "chatAttachments",
  "chatQueue",
  "chatRunId",
  "chatSending",
  "sessionKey",
  "basePath",
  "hello",
  "chatAvatarUrl",
  "refreshSessionsAfterChat",
] as const;

const SCROLL_HOST_FIELDS = [
  "updateComplete",
  "querySelector",
  "style",
  "chatScrollFrame",
  "chatScrollTimeout",
  "chatHasAutoScrolled",
  "chatUserNearBottom",
  "chatNewMessagesBelow",
  "logsScrollFrame",
  "logsAtBottom",
  "topbarObserver",
] as const;

// SettingsHost = PollingHost & ScrollHost & ChatHost plus its own required
// fields. Listing all non-optional members gives a clear failure message
// per-field, matching the pattern used for GatewayHost above.
const SETTINGS_HOST_FIELDS = [
  ...POLLING_HOST_FIELDS,
  ...SCROLL_HOST_FIELDS,
  ...CHAT_HOST_FIELDS,
  "settings",
  "theme",
  "themeResolved",
  "applySessionKey",
  "eventLog",
  "eventLogBuffer",
  "themeMedia",
  "themeMediaHandler",
] as const;

// CompactionHost extends ToolStreamHost with four optional fields
// (compactionStatus, compactionClearTimer, fallbackStatus, fallbackClearTimer).
// Only the inherited ToolStreamHost members are required — asserting those
// via the existing TOOL_STREAM_HOST_FIELDS would duplicate a test, so the
// CompactionHost-specific case exists to document that the interface was
// audited and has no non-optional additions.
const COMPACTION_HOST_REQUIRED_FIELDS = TOOL_STREAM_HOST_FIELDS;

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

  it("initializes every required PollingHost field", () => {
    const app = createApp();
    assertAllDefined(app, POLLING_HOST_FIELDS, "PollingHost");
  });

  it("initializes every required ChatHost field", () => {
    const app = createApp();
    assertAllDefined(app, CHAT_HOST_FIELDS, "ChatHost");
  });

  it("initializes every required ScrollHost field", () => {
    const app = createApp();
    assertAllDefined(app, SCROLL_HOST_FIELDS, "ScrollHost");
  });

  it("initializes every required SettingsHost field", () => {
    const app = createApp();
    assertAllDefined(app, SETTINGS_HOST_FIELDS, "SettingsHost");
  });

  it("initializes every required CompactionHost field", () => {
    const app = createApp();
    assertAllDefined(app, COMPACTION_HOST_REQUIRED_FIELDS, "CompactionHost");
  });
});
