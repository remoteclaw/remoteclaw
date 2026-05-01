import { describe, expect, it, vi } from "vitest";
import { handleDisconnected } from "./app-lifecycle.ts";
import type { RemoteClawApp } from "./app.ts";

function createHost() {
  return {
    basePath: "",
    client: { stop: vi.fn() },
    connectGeneration: 0,
    connected: true,
    tab: "chat",
    assistantName: "RemoteClaw",
    assistantAvatar: null,
    assistantAgentId: null,
    chatHasAutoScrolled: false,
    chatManualRefreshInFlight: false,
    chatLoading: false,
    chatMessages: [],
    chatToolMessages: [],
    chatStream: null,
    logsAutoFollow: false,
    logsAtBottom: true,
    logsEntries: [],
    nodesPollInterval: null,
    logsPollInterval: null,
    debugPollInterval: null,
    themeMedia: null,
    themeMediaHandler: null,
    popStateHandler: vi.fn(),
    topbarObserver: { disconnect: vi.fn() } as unknown as ResizeObserver,
  };
}

describe("handleDisconnected", () => {
  it("stops and clears gateway client on teardown", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener").mockImplementation(() => undefined);
    const host = createHost();
    const disconnectSpy = (host.topbarObserver as unknown as { disconnect: ReturnType<typeof vi.fn> }).disconnect;

    handleDisconnected(host as unknown as RemoteClawApp);

    expect(removeSpy).toHaveBeenCalledWith("popstate", host.popStateHandler);
    expect(host.connectGeneration).toBe(1);
    expect(host.client).toBeNull();
    expect(host.connected).toBe(false);
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
    expect(host.topbarObserver).toBeNull();
    removeSpy.mockRestore();
  });
});
