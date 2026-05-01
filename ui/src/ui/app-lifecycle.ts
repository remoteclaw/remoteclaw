import { connectGateway, type GatewayHost } from "./app-gateway.ts";
import {
  startLogsPolling,
  startNodesPolling,
  stopLogsPolling,
  stopNodesPolling,
  startDebugPolling,
  stopDebugPolling,
  type PollingHost,
} from "./app-polling.ts";
import { observeTopbar, scheduleChatScroll, scheduleLogsScroll, type ScrollHost } from "./app-scroll.ts";
import {
  applySettingsFromUrl,
  attachThemeListener,
  detachThemeListener,
  inferBasePath,
  syncTabWithLocation,
  syncThemeWithSettings,
  type SettingsHost,
} from "./app-settings.ts";
import { loadControlUiBootstrapConfig } from "./controllers/control-ui-bootstrap.ts";

export type LifecycleHost = SettingsHost &
  GatewayHost &
  PollingHost &
  ScrollHost & {
    client: { stop: () => void } | null;
    connectGeneration: number;
    assistantName: string;
    assistantAvatar: string | null;
    assistantAgentId: string | null;
    chatManualRefreshInFlight: boolean;
    chatLoading: boolean;
    chatMessages: unknown[];
    chatStream: string | null;
    logsAutoFollow: boolean;
    logsEntries: unknown[];
    popStateHandler: () => void;
  };

export function handleConnected(host: LifecycleHost) {
  const connectGeneration = ++host.connectGeneration;
  host.basePath = inferBasePath();
  applySettingsFromUrl(host);
  const bootstrapReady = loadControlUiBootstrapConfig(host);
  syncTabWithLocation(host, true);
  syncThemeWithSettings(host);
  attachThemeListener(host);
  window.addEventListener("popstate", host.popStateHandler);
  void bootstrapReady.finally(() => {
    if (host.connectGeneration !== connectGeneration) {
      return;
    }
    connectGateway(host);
  });
  startNodesPolling(host);
  if (host.tab === "logs") {
    startLogsPolling(host);
  }
  if (host.tab === "debug") {
    startDebugPolling(host);
  }
}

export function handleFirstUpdated(host: LifecycleHost) {
  observeTopbar(host);
}

export function handleDisconnected(host: LifecycleHost) {
  host.connectGeneration += 1;
  window.removeEventListener("popstate", host.popStateHandler);
  stopNodesPolling(host);
  stopLogsPolling(host);
  stopDebugPolling(host);
  host.client?.stop();
  host.client = null;
  host.connected = false;
  detachThemeListener(host);
  host.topbarObserver?.disconnect();
  host.topbarObserver = null;
}

export function handleUpdated(host: LifecycleHost, changed: Map<PropertyKey, unknown>) {
  if (host.tab === "chat" && host.chatManualRefreshInFlight) {
    return;
  }
  if (
    host.tab === "chat" &&
    (changed.has("chatMessages") ||
      changed.has("chatToolMessages") ||
      changed.has("chatStream") ||
      changed.has("chatLoading") ||
      changed.has("tab"))
  ) {
    const forcedByTab = changed.has("tab");
    const forcedByLoad = changed.has("chatLoading") && changed.get("chatLoading") === true && !host.chatLoading;
    // Detect streaming start: chatStream changed from null/undefined to a string value
    const previousStream = changed.get("chatStream") as string | null | undefined;
    const streamJustStarted =
      changed.has("chatStream") &&
      (previousStream === null || previousStream === undefined) &&
      typeof host.chatStream === "string";
    scheduleChatScroll(host, forcedByTab || forcedByLoad || streamJustStarted || !host.chatHasAutoScrolled);
  }
  if (host.tab === "logs" && (changed.has("logsEntries") || changed.has("logsAutoFollow") || changed.has("tab"))) {
    if (host.logsAutoFollow && host.logsAtBottom) {
      scheduleLogsScroll(host, changed.has("tab") || changed.has("logsAutoFollow"));
    }
  }
}
