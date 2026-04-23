import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTabFromRoute, type SettingsHost } from "./app-settings.ts";
import type { Tab } from "./navigation.ts";

const createHost = (tab: Tab): SettingsHost => ({
  settings: {
    gatewayUrl: "",
    token: "",
    sessionKey: "main",
    lastActiveSessionKey: "main",
    theme: "system",
    chatFocusMode: false,
    chatShowThinking: true,
    splitRatio: 0.6,
    navCollapsed: false,
    navGroupsCollapsed: {},
  },
  theme: "system",
  themeResolved: "dark",
  applySessionKey: "main",
  sessionKey: "main",
  tab,
  connected: false,
  chatHasAutoScrolled: false,
  logsAtBottom: false,
  eventLog: [],
  eventLogBuffer: [],
  basePath: "",
  themeMedia: null,
  themeMediaHandler: null,
  nodesPollInterval: null,
  logsPollInterval: null,
  debugPollInterval: null,
  // ChatHost fields (unused by setTabFromRoute; required by SettingsHost intersection)
  chatMessage: "",
  chatAttachments: [],
  chatQueue: [],
  chatRunId: null,
  chatSending: false,
  hello: null,
  chatAvatarUrl: null,
  refreshSessionsAfterChat: new Set<string>(),
  // ScrollHost fields (unused by setTabFromRoute; required by SettingsHost intersection)
  updateComplete: Promise.resolve(true),
  querySelector: () => null,
  style: {} as CSSStyleDeclaration,
  chatScrollFrame: null,
  chatScrollTimeout: null,
  chatUserNearBottom: true,
  chatNewMessagesBelow: false,
  logsScrollFrame: null,
  topbarObserver: null,
});

describe("setTabFromRoute", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts and stops log polling based on the tab", () => {
    const host = createHost("chat");

    setTabFromRoute(host, "logs");
    expect(host.logsPollInterval).not.toBeNull();
    expect(host.debugPollInterval).toBeNull();

    setTabFromRoute(host, "chat");
    expect(host.logsPollInterval).toBeNull();
  });

  it("starts and stops debug polling based on the tab", () => {
    const host = createHost("chat");

    setTabFromRoute(host, "debug");
    expect(host.debugPollInterval).not.toBeNull();
    expect(host.logsPollInterval).toBeNull();

    setTabFromRoute(host, "chat");
    expect(host.debugPollInterval).toBeNull();
  });
});
