import { afterEach, describe, expect, it, vi } from "vitest";
import { registerPluginHttpRoute } from "./http-registry.js";
import { createEmptyPluginRegistry } from "./registry.js";
import {
  pinActivePluginHttpRouteRegistry,
  releasePinnedPluginHttpRouteRegistry,
  setActivePluginRegistry,
} from "./runtime.js";

describe("registerPluginHttpRoute", () => {
  afterEach(() => {
    releasePinnedPluginHttpRouteRegistry();
    setActivePluginRegistry(createEmptyPluginRegistry());
  });

  it("registers route and unregisters it", () => {
    const registry = createEmptyPluginRegistry();
    const handler = vi.fn();

    const unregister = registerPluginHttpRoute({
      path: "/plugins/demo",
      auth: "plugin",
      handler,
      registry,
    });

    expect(registry.httpRoutes).toHaveLength(1);
    expect(registry.httpRoutes[0]?.path).toBe("/plugins/demo");
    expect(registry.httpRoutes[0]?.handler).toBe(handler);
    expect(registry.httpRoutes[0]?.auth).toBe("plugin");
    expect(registry.httpRoutes[0]?.match).toBe("exact");

    unregister();
    expect(registry.httpRoutes).toHaveLength(0);
  });

  it("returns noop unregister when path is missing", () => {
    const registry = createEmptyPluginRegistry();
    const logs: string[] = [];
    const unregister = registerPluginHttpRoute({
      path: "",
      auth: "plugin",
      handler: vi.fn(),
      registry,
      accountId: "default",
      log: (msg) => logs.push(msg),
    });

    expect(registry.httpRoutes).toHaveLength(0);
    expect(logs).toEqual(['plugin: webhook path missing for account "default"']);
    expect(() => unregister()).not.toThrow();
  });

  it("replaces stale route on same path and match", () => {
    const registry = createEmptyPluginRegistry();
    const logs: string[] = [];
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();

    registerPluginHttpRoute({
      path: "/plugins/synology",
      auth: "plugin",
      handler: firstHandler,
      registry,
      accountId: "default",
      pluginId: "synology-chat",
      log: (msg) => logs.push(msg),
    });

    registerPluginHttpRoute({
      path: "/plugins/synology",
      auth: "plugin",
      handler: secondHandler,
      registry,
      accountId: "default",
      pluginId: "synology-chat",
      log: (msg) => logs.push(msg),
    });

    expect(registry.httpRoutes).toHaveLength(1);
    expect(registry.httpRoutes[0]?.handler).toBe(secondHandler);
    expect(logs).toContain(
      'plugin: replacing stale webhook path /plugins/synology (exact) for account "default" (synology-chat)',
    );
  });

  it("rejects mixed-auth overlapping routes", () => {
    const registry = createEmptyPluginRegistry();
    const logs: string[] = [];

    registerPluginHttpRoute({
      path: "/plugin/secure",
      auth: "gateway",
      match: "prefix",
      handler: vi.fn(),
      registry,
      pluginId: "demo-gateway",
      source: "demo-gateway-src",
      log: (msg) => logs.push(msg),
    });

    const unregister = registerPluginHttpRoute({
      path: "/plugin/secure/report",
      auth: "plugin",
      match: "exact",
      handler: vi.fn(),
      registry,
      pluginId: "demo-plugin",
      source: "demo-plugin-src",
      log: (msg) => logs.push(msg),
    });

    expect(registry.httpRoutes).toHaveLength(1);
    expect(logs.at(-1)).toContain("route overlap denied");

    unregister();
    expect(registry.httpRoutes).toHaveLength(1);
  });

  it("uses the pinned route registry when the active registry changes later", () => {
    const startupRegistry = createEmptyPluginRegistry();
    const laterActiveRegistry = createEmptyPluginRegistry();

    setActivePluginRegistry(startupRegistry);
    pinActivePluginHttpRouteRegistry(startupRegistry);
    setActivePluginRegistry(laterActiveRegistry);

    const unregister = registerPluginHttpRoute({
      path: "/bluebubbles-webhook",
      auth: "plugin",
      handler: vi.fn(),
    });

    expect(startupRegistry.httpRoutes).toHaveLength(1);
    expect(startupRegistry.httpRoutes[0]?.path).toBe("/bluebubbles-webhook");
    expect(laterActiveRegistry.httpRoutes).toHaveLength(0);

    unregister();
    expect(startupRegistry.httpRoutes).toHaveLength(0);
  });
});
