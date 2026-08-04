// Covers beacon -> connection-target normalization, including the host guard.
//
// This lives beside the source rather than with the gateway-status command
// tests because src/infra/** runs in the CI unit lane and src/commands/** does
// not, so the guard regresses loudly here.
import { describe, expect, it } from "vitest";
import type { GatewayBonjourBeacon } from "./bonjour-discovery.js";
import {
  buildGatewayDiscoveryTarget,
  serializeGatewayDiscoveryBeacon,
} from "./gateway-discovery-targets.js";

describe("buildGatewayDiscoveryTarget", () => {
  it("builds ws and ssh targets from a resolved beacon", () => {
    const target = buildGatewayDiscoveryTarget(
      { instanceName: "Gateway", host: "studio.example", port: 18789, sshPort: 2222 },
      { sshUser: "steipete" },
    );

    expect(target.wsUrl).toBe("ws://studio.example:18789");
    expect(target.sshTarget).toBe("steipete@studio.example:2222");
  });

  it("yields no targets for a beacon carrying only TXT hints", () => {
    // TXT records are published by anyone on the discovery network. Without a
    // resolved SRV/A endpoint there is nothing authenticated to connect to.
    const target = buildGatewayDiscoveryTarget(
      {
        instanceName: "txt-only",
        tailnetDns: "attacker.tailnet.ts.net",
        lanHost: "attacker.example.com",
        gatewayPort: 19443,
      },
      { sshUser: "steipete" },
    );

    expect(target.endpoint).toBeNull();
    expect(target.wsUrl).toBeNull();
    expect(target.sshTarget).toBeNull();
  });

  it("refuses a resolved host ssh(1) would parse as an option", () => {
    const target = buildGatewayDiscoveryTarget(
      { instanceName: "hostile", host: "-oProxyCommand=touch~hacked", port: 18789 },
      { sshUser: "steipete" },
    );

    expect(target.sshTarget).toBeNull();
  });

  it("omits the port suffix for the default ssh port and when none is advertised", () => {
    const withDefault = buildGatewayDiscoveryTarget(
      { instanceName: "Gateway", host: "studio.example", port: 18789, sshPort: 22 },
      { sshUser: "steipete" },
    );
    const withNone = buildGatewayDiscoveryTarget(
      { instanceName: "Gateway", host: "studio.example", port: 18789 },
      { sshUser: "steipete" },
    );

    expect(withDefault.sshTarget).toBe("steipete@studio.example");
    expect(withNone.sshTarget).toBe("steipete@studio.example");
  });

  it("drops the user prefix when no ssh user is known", () => {
    const target = buildGatewayDiscoveryTarget({
      instanceName: "Gateway",
      host: "studio.example",
      port: 18789,
    });

    expect(target.sshTarget).toBe("studio.example");
  });
});

describe("serializeGatewayDiscoveryBeacon", () => {
  it("reports the raw TXT hints but a null wsUrl when nothing resolved", () => {
    const beacon: GatewayBonjourBeacon = {
      instanceName: "txt-only",
      tailnetDns: "attacker.tailnet.ts.net",
      lanHost: "attacker.example.com",
      gatewayPort: 19443,
    };

    // The hints stay visible for diagnostics; only the actionable URL is
    // withheld, so an operator can still see what was advertised.
    expect(serializeGatewayDiscoveryBeacon(beacon)).toMatchObject({
      tailnetDns: "attacker.tailnet.ts.net",
      lanHost: "attacker.example.com",
      gatewayPort: 19443,
      host: null,
      wsUrl: null,
    });
  });
});
