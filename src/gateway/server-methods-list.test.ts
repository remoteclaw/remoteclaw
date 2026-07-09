import { describe, expect, it } from "vitest";
import { listGatewayMethods } from "./server-methods-list.js";

describe("listGatewayMethods", () => {
  // RemoteClaw gates its advertised gateway surface to the middleware feature set: the realtime
  // Talk session/client RPCs, the memory dream-diary doctor methods, and node.pluginSurface.refresh
  // are intentionally absent (see server-methods-list.ts). Upstream's positive-surface assertions do
  // not apply here; the load-bearing invariant the fork keeps is that hidden/dangerous core handlers
  // are never advertised over the gateway.
  it("does not advertise hidden core handlers", () => {
    const methods = listGatewayMethods();
    expect(methods).not.toContain("config.openFile");
    expect(methods).not.toContain("chat.inject");
    expect(methods).not.toContain("nativeHook.invoke");
    expect(methods).not.toContain("sessions.usage");
  });
});
