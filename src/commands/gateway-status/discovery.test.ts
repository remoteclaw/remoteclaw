// Covers SSH target inference from remote URLs and discovery beacons.
//
// NOTE: src/commands/** is collected by no CI lane today (tracked as one of the
// gates on #3076), so these run locally only. The host denylist they exercise
// is additionally unit-tested in src/infra/ssh-host-safety.test.ts, which does
// run in the unit lane.
import { describe, expect, it } from "vitest";
import type { GatewayBonjourBeacon } from "../../infra/bonjour-discovery.js";
import { withEnvAsync } from "../../test-utils/env.js";
import {
  inferSshTargetFromRemoteUrl,
  pickAutoSshTargetFromDiscovery,
  resolveSshTarget,
} from "./discovery.js";

type SshConfigModule = typeof import("../../infra/ssh-config.js");
type SshTunnelModule = typeof import("../../infra/ssh-tunnel.js");

function fakeSshModules(
  config: {
    user?: string;
    host?: string;
    port?: number;
    identityFiles?: string[];
  } | null,
) {
  return {
    loadSshConfigModule: async () =>
      ({
        resolveSshConfig: async () => (config ? { identityFiles: [], ...config } : null),
      }) as unknown as SshConfigModule,
    loadSshTunnelModule: async () =>
      ({
        parseSshTarget: (raw: string) => {
          const [user, host] = raw.includes("@") ? raw.split("@", 2) : [undefined, raw];
          return host ? { user, host, port: 22 } : null;
        },
      }) as unknown as SshTunnelModule,
  };
}

// Stand-in for infra/ssh-tunnel.js parseSshTarget that only rejects a target
// whose FIRST character is '-'. It cannot see a dangerous host behind a
// "user@" prefix, which is what makes it a real test of the caller's guard
// rather than of the tunnel parser's.
function permissiveParseSshTarget(target: string): unknown {
  return target.startsWith("-") ? null : { target };
}

describe("inferSshTargetFromRemoteUrl", () => {
  it("infers user@host from a well-formed remote URL", async () => {
    await withEnvAsync({ USER: "steipete" }, async () => {
      expect(inferSshTargetFromRemoteUrl("wss://studio.example:18789")).toBe(
        "steipete@studio.example",
      );
    });
  });

  // See discovery.ts: the WHATWG parser accepts a leading '-' in the host.
  it("rejects a remote URL whose hostname would become an ssh option", async () => {
    await withEnvAsync({ USER: "steipete" }, async () => {
      expect(inferSshTargetFromRemoteUrl("wss://-V:18789")).toBeNull();
      expect(inferSshTargetFromRemoteUrl("wss://-oProxyCommand=touch~hacked:18789")).toBeNull();
    });
  });

  it("returns null for non-strings, blanks, and unparseable URLs", () => {
    expect(inferSshTargetFromRemoteUrl(null)).toBeNull();
    expect(inferSshTargetFromRemoteUrl(undefined)).toBeNull();
    expect(inferSshTargetFromRemoteUrl("   ")).toBeNull();
    expect(inferSshTargetFromRemoteUrl("not a url")).toBeNull();
  });
});

describe("resolveSshTarget", () => {
  it("adopts the host and port ssh_config resolves to", async () => {
    const resolved = await resolveSshTarget({
      rawTarget: "steipete@studio",
      identity: null,
      overallTimeoutMs: 1000,
      ...fakeSshModules({ user: "steipete", host: "studio.example", port: 2222 }),
    });

    expect(resolved).toEqual({ target: "steipete@studio.example:2222", identity: undefined });
  });

  it("does not adopt an ssh_config HostName that would become an ssh option", async () => {
    const resolved = await resolveSshTarget({
      rawTarget: "steipete@studio",
      identity: null,
      overallTimeoutMs: 1000,
      ...fakeSshModules({ user: "steipete", host: "-oProxyCommand=touch~hacked", port: 2222 }),
    });

    expect(resolved).toEqual({ target: "steipete@studio", identity: undefined });
  });

  it("returns null when the raw target does not parse", async () => {
    const resolved = await resolveSshTarget({
      rawTarget: "",
      identity: null,
      overallTimeoutMs: 1000,
      ...fakeSshModules(null),
    });

    expect(resolved).toBeNull();
  });
});

describe("pickAutoSshTargetFromDiscovery", () => {
  it("ignores beacons that only carry TXT hints", () => {
    const discovery: GatewayBonjourBeacon[] = [
      { instanceName: "bad", tailnetDns: "-V" },
      { instanceName: "txt-only", tailnetDns: "goodhost", gatewayPort: 18789 },
      { instanceName: "lan-hint", lanHost: "lan.example", gatewayPort: 18789 },
    ];

    expect(
      pickAutoSshTargetFromDiscovery({
        discovery,
        parseSshTarget: permissiveParseSshTarget,
        sshUser: "steipete",
      }),
    ).toBeNull();
  });

  it("uses the first beacon that resolved to a real host and port", () => {
    const discovery: GatewayBonjourBeacon[] = [
      { instanceName: "bad", tailnetDns: "-V" },
      { instanceName: "Gateway", host: "goodhost", port: 18789, sshPort: 2222 },
    ];

    expect(
      pickAutoSshTargetFromDiscovery({
        discovery,
        parseSshTarget: permissiveParseSshTarget,
        sshUser: "steipete",
      }),
    ).toBe("steipete@goodhost:2222");
  });

  it("rejects a resolved host that would become an ssh option", () => {
    const discovery: GatewayBonjourBeacon[] = [
      { instanceName: "hostile", host: "-oProxyCommand=touch~hacked", port: 18789 },
    ];

    expect(
      pickAutoSshTargetFromDiscovery({
        discovery,
        parseSshTarget: permissiveParseSshTarget,
        sshUser: "steipete",
      }),
    ).toBeNull();
  });
});
