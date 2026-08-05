// Covers Bonjour gateway beacon parsing and endpoint resolution.
import { describe, expect, it, vi } from "vitest";
import type { runCommandWithTimeout } from "../process/exec.js";
import {
  discoverGatewayBeacons,
  type GatewayBonjourBeacon,
  resolveGatewayDiscoveryEndpoint,
} from "./bonjour-discovery.js";

const WIDE_AREA_DOMAIN = "remoteclaw.internal.";

function collectMatching<T, U>(
  items: readonly T[],
  predicate: (item: T) => boolean,
  map: (item: T) => U,
): U[] {
  const matches: U[] = [];
  for (const item of items) {
    if (predicate(item)) {
      matches.push(map(item));
    }
  }
  return matches;
}

function findBeaconByInstance(
  beacons: readonly GatewayBonjourBeacon[],
  instanceName: string,
): GatewayBonjourBeacon {
  const beacon = beacons.find((item) => item.instanceName === instanceName);
  if (!beacon) {
    throw new Error(`Expected beacon ${instanceName}`);
  }
  return beacon;
}

function getOnlyBeacon(beacons: readonly GatewayBonjourBeacon[]): GatewayBonjourBeacon {
  expect(beacons).toHaveLength(1);
  const beacon = beacons[0];
  if (!beacon) {
    throw new Error("Expected one beacon");
  }
  return beacon;
}

describe("bonjour-discovery", () => {
  it("discovers beacons on darwin across local + wide-area domains", async () => {
    const calls: Array<{ argv: string[]; timeoutMs: number }> = [];
    const studioInstance = "Peter’s Mac Studio Gateway";

    const run = vi.fn(async (argv: string[], options: { timeoutMs: number }) => {
      calls.push({ argv, timeoutMs: options.timeoutMs });
      const domain = argv[3] ?? "";

      if (argv[0] === "dns-sd" && argv[1] === "-B") {
        if (domain === "local.") {
          return {
            stdout: [
              "Add 2 3 local. _remoteclaw-gw._tcp. Peter\\226\\128\\153s Mac Studio Gateway",
              "Add 2 3 local. _remoteclaw-gw._tcp. Laptop Gateway",
              "",
            ].join("\n"),
            stderr: "",
            code: 0,
            signal: null,
            killed: false,
          };
        }
        if (domain === WIDE_AREA_DOMAIN) {
          return {
            stdout: [`Add 2 3 ${WIDE_AREA_DOMAIN} _remoteclaw-gw._tcp. Tailnet Gateway`, ""].join(
              "\n",
            ),
            stderr: "",
            code: 0,
            signal: null,
            killed: false,
          };
        }
      }

      if (argv[0] === "dns-sd" && argv[1] === "-L") {
        const instance = argv[2] ?? "";
        const host =
          instance === studioInstance
            ? "studio.local"
            : instance === "Laptop Gateway"
              ? "laptop.local"
              : "tailnet.local";
        const tailnetDns = instance === "Tailnet Gateway" ? "studio.tailnet.ts.net" : "";
        const displayName =
          instance === studioInstance
            ? "Peter’s\\032Mac\\032Studio"
            : instance.replace(" Gateway", "");
        const txtParts = [
          "txtvers=1",
          `displayName=${displayName}`,
          `lanHost=${host}`,
          "gatewayPort=18789",
          "sshPort=22",
          tailnetDns ? `tailnetDns=${tailnetDns}` : null,
        ].filter((v): v is string => Boolean(v));

        return {
          stdout: [
            `${instance}._remoteclaw-gw._tcp. can be reached at ${host}:18789`,
            txtParts.join(" "),
            "",
          ].join("\n"),
          stderr: "",
          code: 0,
          signal: null,
          killed: false,
        };
      }

      throw new Error(`unexpected argv: ${argv.join(" ")}`);
    });

    const beacons = await discoverGatewayBeacons({
      platform: "darwin",
      timeoutMs: 1234,
      wideAreaDomain: WIDE_AREA_DOMAIN,
      run: run as unknown as typeof runCommandWithTimeout,
    });

    expect(beacons).toHaveLength(3);
    const studioBeacon = findBeaconByInstance(beacons, studioInstance);
    expect(studioBeacon.displayName).toBe("Peter’s Mac Studio");
    expect(beacons.map((b) => b.domain)).toContain("local.");
    expect(beacons.map((b) => b.domain)).toContain(WIDE_AREA_DOMAIN);

    const browseCalls = calls.filter((c) => c.argv[0] === "dns-sd" && c.argv[1] === "-B");
    expect(browseCalls.map((c) => c.argv[3])).toContain("local.");
    expect(browseCalls.map((c) => c.argv[3])).toContain(WIDE_AREA_DOMAIN);
    expect([...new Set(browseCalls.map((c) => c.timeoutMs))]).toEqual([1234]);
  });

  it("decodes dns-sd octal escapes in TXT displayName", async () => {
    const run = vi.fn(async (argv: string[], options: { timeoutMs: number }) => {
      if (options.timeoutMs < 0) {
        throw new Error("invalid timeout");
      }

      const domain = argv[3] ?? "";
      if (argv[0] === "dns-sd" && argv[1] === "-B" && domain === "local.") {
        return {
          stdout: ["Add 2 3 local. _remoteclaw-gw._tcp. Studio Gateway", ""].join("\n"),
          stderr: "",
          code: 0,
          signal: null,
          killed: false,
        };
      }

      if (argv[0] === "dns-sd" && argv[1] === "-L") {
        return {
          stdout: [
            "Studio Gateway._remoteclaw-gw._tcp. can be reached at studio.local:18789",
            "txtvers=1 displayName=Peter\\226\\128\\153s\\032Mac\\032Studio lanHost=studio.local gatewayPort=18789 sshPort=22",
            "",
          ].join("\n"),
          stderr: "",
          code: 0,
          signal: null,
          killed: false,
        };
      }

      return {
        stdout: "",
        stderr: "",
        code: 0,
        signal: null,
        killed: false,
      };
    });

    const beacons = await discoverGatewayBeacons({
      platform: "darwin",
      timeoutMs: 800,
      domains: ["local."],
      run: run as unknown as typeof runCommandWithTimeout,
    });

    const beacon = getOnlyBeacon(beacons);
    expect(beacon.domain).toBe("local.");
    expect(beacon.instanceName).toBe("Studio Gateway");
    expect(beacon.displayName).toBe("Peter’s Mac Studio");
    expect(beacon.txt?.displayName).toBe("Peter’s Mac Studio");
  });

  it("rejects malformed and out-of-range advertised ports", async () => {
    const run = vi.fn(async (argv: string[]) => {
      const domain = argv[3] ?? "";
      if (argv[0] === "dns-sd" && argv[1] === "-B" && domain === "local.") {
        return {
          stdout: ["Add 2 3 local. _remoteclaw-gw._tcp. Broken Gateway", ""].join("\n"),
          stderr: "",
          code: 0,
          signal: null,
          killed: false,
        };
      }

      if (argv[0] === "dns-sd" && argv[1] === "-L") {
        return {
          stdout: [
            "Broken Gateway._remoteclaw-gw._tcp. can be reached at broken.local:18789abc",
            "txtvers=1 displayName=Broken gatewayPort=70000 sshPort=22x",
            "",
          ].join("\n"),
          stderr: "",
          code: 0,
          signal: null,
          killed: false,
        };
      }

      throw new Error(`unexpected argv: ${argv.join(" ")}`);
    });

    const beacons = await discoverGatewayBeacons({
      platform: "darwin",
      timeoutMs: 800,
      domains: ["local."],
      run: run as unknown as typeof runCommandWithTimeout,
    });

    const beacon = getOnlyBeacon(beacons);
    expect(beacon.host).toBe("broken.local");
    expect(beacon.port).toBeUndefined();
    expect(beacon.gatewayPort).toBeUndefined();
    expect(beacon.sshPort).toBeUndefined();
    expect(resolveGatewayDiscoveryEndpoint(beacon)).toBeNull();
  });

  it("falls back to tailnet DNS probing for wide-area when split DNS is not configured", async () => {
    const calls: Array<{ argv: string[]; timeoutMs: number }> = [];
    const zone = WIDE_AREA_DOMAIN.replace(/\.$/, "");
    const serviceBase = `_remoteclaw-gw._tcp.${zone}`;
    const studioService = `studio-gateway.${serviceBase}`;

    const run = vi.fn(async (argv: string[], options: { timeoutMs: number }) => {
      calls.push({ argv, timeoutMs: options.timeoutMs });
      const cmd = argv[0];

      if (cmd === "dns-sd" && argv[1] === "-B") {
        return {
          stdout: "",
          stderr: "",
          code: 0,
          signal: null,
          killed: false,
        };
      }

      if (cmd === "tailscale" && argv[1] === "status" && argv[2] === "--json") {
        return {
          stdout: JSON.stringify({
            Self: { TailscaleIPs: ["100.69.232.64"] },
            Peer: {
              "peer-1": { TailscaleIPs: ["100.123.224.76"] },
            },
          }),
          stderr: "",
          code: 0,
          signal: null,
          killed: false,
        };
      }

      if (cmd === "dig") {
        const at = argv.find((a) => a.startsWith("@")) ?? "";
        const server = at.replace(/^@/, "");
        const qname = argv[argv.length - 2] ?? "";
        const qtype = argv[argv.length - 1] ?? "";

        if (server === "100.123.224.76" && qtype === "PTR" && qname === serviceBase) {
          return {
            stdout: `${studioService}.\n`,
            stderr: "",
            code: 0,
            signal: null,
            killed: false,
          };
        }

        if (server === "100.123.224.76" && qtype === "SRV" && qname === studioService) {
          return {
            stdout: `0 0 18789 studio.${zone}.\n`,
            stderr: "",
            code: 0,
            signal: null,
            killed: false,
          };
        }

        if (server === "100.123.224.76" && qtype === "TXT" && qname === studioService) {
          return {
            stdout: [
              `"displayName=Studio"`,
              `"gatewayPort=18789"`,
              `"transport=gateway"`,
              `"sshPort=22"`,
              `"tailnetDns=peters-mac-studio-1.sheep-coho.ts.net"`,
              `"cliPath=/opt/homebrew/bin/remoteclaw"`,
              "",
            ].join(" "),
            stderr: "",
            code: 0,
            signal: null,
            killed: false,
          };
        }
      }

      throw new Error(`unexpected argv: ${argv.join(" ")}`);
    });

    const beacons = await discoverGatewayBeacons({
      platform: "darwin",
      timeoutMs: 1200,
      domains: [WIDE_AREA_DOMAIN],
      wideAreaDomain: WIDE_AREA_DOMAIN,
      run: run as unknown as typeof runCommandWithTimeout,
    });

    const beacon = getOnlyBeacon(beacons);
    expect(beacon.domain).toBe(WIDE_AREA_DOMAIN);
    expect(beacon.instanceName).toBe("studio-gateway");
    expect(beacon.displayName).toBe("Studio");
    expect(beacon.host).toBe(`studio.${zone}`);
    expect(beacon.port).toBe(18789);
    expect(beacon.tailnetDns).toBe("peters-mac-studio-1.sheep-coho.ts.net");
    expect(beacon.gatewayPort).toBe(18789);
    expect(beacon.sshPort).toBe(22);
    expect(beacon.cliPath).toBe("/opt/homebrew/bin/remoteclaw");

    expect(calls.map((c) => c.argv.slice(0, 2).join(" "))).toContain("tailscale status");
    expect(calls.map((c) => c.argv[0])).toContain("dig");
  });

  // Producer-side argv guard (#3101). An mDNS instance name is publishable by
  // any LAN peer and a PTR answer by any responding DNS server; both land in an
  // argv operand slot where a leading '-' is read as a flag. Neither dns-sd nor
  // dig accepts "--", so the hostile record is dropped rather than neutralized.
  it("never lets a dash-prefixed mDNS instance name reach dns-sd argv", async () => {
    const calls: string[][] = [];
    const run = vi.fn(async (argv: string[]) => {
      calls.push(argv);
      if (argv[0] === "dns-sd" && argv[1] === "-B") {
        return {
          stdout: [
            "Add 2 3 local. _remoteclaw-gw._tcp. -f/etc/passwd",
            // The same attack smuggled through a dns-sd octal escape: "\045" is
            // '-', so this decodes to "-oEscaped" and is caught only if the guard
            // runs after decodeDnsSdEscapes. Kept distinct from the literal case
            // above so the Set cannot dedupe the two into one assertion.
            "Add 2 3 local. _remoteclaw-gw._tcp. \\045oEscaped",
            "Add 2 3 local. _remoteclaw-gw._tcp. Laptop Gateway",
            "",
          ].join("\n"),
          stderr: "",
          code: 0,
          signal: null,
          killed: false,
        };
      }
      if (argv[0] === "dns-sd" && argv[1] === "-L") {
        return {
          stdout: [
            `${argv[2]}._remoteclaw-gw._tcp. can be reached at laptop.local:18789`,
            "txtvers=1 gatewayPort=18789",
            "",
          ].join("\n"),
          stderr: "",
          code: 0,
          signal: null,
          killed: false,
        };
      }
      throw new Error(`unexpected argv: ${argv.join(" ")}`);
    });

    const beacons = await discoverGatewayBeacons({
      platform: "darwin",
      timeoutMs: 800,
      domains: ["local."],
      run: run as unknown as typeof runCommandWithTimeout,
    });

    const resolveArgs = collectMatching(
      calls,
      (c) => c[0] === "dns-sd" && c[1] === "-L",
      (c) => c[2] ?? "",
    );
    // The assertion that bites: nothing option-shaped occupies the operand slot.
    expect(resolveArgs.filter((arg) => arg.startsWith("-"))).toEqual([]);
    expect(resolveArgs).toEqual(["Laptop Gateway"]);

    // Over-rejection guard: one hostile publisher must not suppress its
    // well-behaved neighbours, or the fix is worse than the bug.
    expect(beacons.map((b) => b.instanceName)).toEqual(["Laptop Gateway"]);
  });

  // The regression a too-eager guard would cause. RFC 6763 §4.1.1 instance names
  // are free-form UTF-8, so a guard rejecting '-' anywhere (or non-ASCII, or
  // spaces, the way the SSH host denylist does) would silently stop discovering
  // most real gateways while still reading as "hardened".
  it("still passes well-formed instance names through to dns-sd unchanged", async () => {
    const wellFormed = [
      "Laptop Gateway", // spaces
      "peters-mac-studio-1", // interior and trailing hyphens
      "Peter’s Mac Studio", // non-ASCII punctuation
      "studio.local", // dots
      "gw_01", // underscore
    ];

    const calls: string[][] = [];
    const run = vi.fn(async (argv: string[]) => {
      calls.push(argv);
      if (argv[0] === "dns-sd" && argv[1] === "-B") {
        return {
          stdout: [
            ...wellFormed.map((name) => `Add 2 3 local. _remoteclaw-gw._tcp. ${name}`),
            "",
          ].join("\n"),
          stderr: "",
          code: 0,
          signal: null,
          killed: false,
        };
      }
      if (argv[0] === "dns-sd" && argv[1] === "-L") {
        return {
          stdout: [`${argv[2]}._remoteclaw-gw._tcp. can be reached at host.local:18789`, ""].join(
            "\n",
          ),
          stderr: "",
          code: 0,
          signal: null,
          killed: false,
        };
      }
      throw new Error(`unexpected argv: ${argv.join(" ")}`);
    });

    const beacons = await discoverGatewayBeacons({
      platform: "darwin",
      timeoutMs: 800,
      domains: ["local."],
      run: run as unknown as typeof runCommandWithTimeout,
    });

    const resolveArgs = collectMatching(
      calls,
      (c) => c[0] === "dns-sd" && c[1] === "-L",
      (c) => c[2] ?? "",
    );
    expect(resolveArgs).toEqual(wellFormed);
    expect(beacons.map((b) => b.instanceName)).toEqual(wellFormed);
  });

  it("never lets a dash-prefixed PTR answer reach dig argv", async () => {
    const calls: string[][] = [];
    const zone = WIDE_AREA_DOMAIN.replace(/\.$/, "");
    const serviceBase = `_remoteclaw-gw._tcp.${zone}`;
    const goodService = `studio-gateway.${serviceBase}`;

    const run = vi.fn(async (argv: string[]) => {
      calls.push(argv);
      const cmd = argv[0];

      if (cmd === "dns-sd" && argv[1] === "-B") {
        return { stdout: "", stderr: "", code: 0, signal: null, killed: false };
      }
      if (cmd === "tailscale" && argv[1] === "status") {
        return {
          stdout: JSON.stringify({ Self: { TailscaleIPs: ["100.69.232.64"] } }),
          stderr: "",
          code: 0,
          signal: null,
          killed: false,
        };
      }
      if (cmd === "dig") {
        const qname = argv[argv.length - 2] ?? "";
        const qtype = argv[argv.length - 1] ?? "";
        if (qtype === "PTR" && qname === serviceBase) {
          // A hostile DNS server answering the PTR probe with a flag.
          return {
            stdout: `-f/etc/passwd\n${goodService}.\n`,
            stderr: "",
            code: 0,
            signal: null,
            killed: false,
          };
        }
        if (qtype === "SRV" && qname === goodService) {
          return {
            stdout: `0 0 18789 studio.${zone}.\n`,
            stderr: "",
            code: 0,
            signal: null,
            killed: false,
          };
        }
        return { stdout: "", stderr: "", code: 0, signal: null, killed: false };
      }
      throw new Error(`unexpected argv: ${argv.join(" ")}`);
    });

    const beacons = await discoverGatewayBeacons({
      platform: "darwin",
      timeoutMs: 1200,
      domains: [WIDE_AREA_DOMAIN],
      wideAreaDomain: WIDE_AREA_DOMAIN,
      run: run as unknown as typeof runCommandWithTimeout,
    });

    // dig takes the query name as an operand; nothing there may start with '-'.
    const digOperands = collectMatching(
      calls,
      (c) => c[0] === "dig",
      (c) => c[c.length - 2] ?? "",
    );
    expect(digOperands.filter((arg) => arg.startsWith("-"))).toEqual([]);

    // The clean PTR from the same answer set still resolves.
    expect(beacons.map((b) => b.host)).toEqual([`studio.${zone}`]);
  });

  // The dig-specific half of the producer guard. dig(1)'s dangerous prefix set is
  // wider than '-', and both extras were probed against the system dig with a
  // loopback listener:
  //   '@' selects the nameserver POSITIONALLY and the LAST one wins, so an
  //       '@'-prefixed PTR answer landing after the pinned tailnet nameserver
  //       sends the follow-up SRV/TXT query to an arbitrary host:53 — the beacon
  //       then comes from the attacker's server, not the tailnet's.
  //   '+' introduces a dig option, so a '+tcp' answer is consumed as one and the
  //       query name collapses to ".".
  // Neither is caught by `isArgvOptionLike`, which is why the dig path uses the
  // wider `isUnsafeDigOperand` rather than that shared predicate being widened.
  //
  // Split per prefix rather than asserted in one test: a single test stops at its
  // first failing expect, so one hostile prefix would mask the other.
  const HOSTILE_PTR_NAMESERVER = "@127.0.0.1";
  const HOSTILE_PTR_OPTION = "+tcp";
  const PINNED_NAMESERVER = "100.69.232.64";

  // Drives the wide-area dig fallback with `hostile` present in the PTR answer
  // set alongside one well-formed service, and returns every argv it spawned.
  async function runWideAreaWithHostilePtr(hostile: string): Promise<{
    calls: string[][];
    beacons: GatewayBonjourBeacon[];
  }> {
    const calls: string[][] = [];
    const zone = WIDE_AREA_DOMAIN.replace(/\.$/, "");
    const serviceBase = `_remoteclaw-gw._tcp.${zone}`;
    const goodService = `studio-gateway.${serviceBase}`;

    const run = vi.fn(async (argv: string[]) => {
      calls.push(argv);
      const cmd = argv[0];

      if (cmd === "dns-sd" && argv[1] === "-B") {
        return { stdout: "", stderr: "", code: 0, signal: null, killed: false };
      }
      if (cmd === "tailscale" && argv[1] === "status") {
        return {
          stdout: JSON.stringify({ Self: { TailscaleIPs: [PINNED_NAMESERVER] } }),
          stderr: "",
          code: 0,
          signal: null,
          killed: false,
        };
      }
      if (cmd === "dig") {
        const qname = argv[argv.length - 2] ?? "";
        const qtype = argv[argv.length - 1] ?? "";
        if (qtype === "PTR" && qname === serviceBase) {
          // A hostile DNS server answering the PTR probe with dig syntax rather
          // than a name. Both payloads survive a leading-'-' check untouched.
          return {
            stdout: `${hostile}\n${goodService}.\n`,
            stderr: "",
            code: 0,
            signal: null,
            killed: false,
          };
        }
        if (qtype === "SRV" && qname === goodService) {
          return {
            stdout: `0 0 18789 studio.${zone}.\n`,
            stderr: "",
            code: 0,
            signal: null,
            killed: false,
          };
        }
        return { stdout: "", stderr: "", code: 0, signal: null, killed: false };
      }
      throw new Error(`unexpected argv: ${argv.join(" ")}`);
    });

    const beacons = await discoverGatewayBeacons({
      platform: "darwin",
      timeoutMs: 1200,
      domains: [WIDE_AREA_DOMAIN],
      wideAreaDomain: WIDE_AREA_DOMAIN,
      run: run as unknown as typeof runCommandWithTimeout,
    });
    return { calls, beacons };
  }

  it("never lets an '@'-prefixed PTR answer reach dig argv", async () => {
    const { calls, beacons } = await runWideAreaWithHostilePtr(HOSTILE_PTR_NAMESERVER);
    const zone = WIDE_AREA_DOMAIN.replace(/\.$/, "");

    const digCalls = calls.filter((c) => c[0] === "dig");
    expect(digCalls.length).toBeGreaterThan(0);

    // The assertion that bites: the attack is a SECOND '@' argument after the
    // pinned one, which dig resolves last-wins. So no dig invocation may carry
    // any nameserver selector other than the one this code pinned itself.
    const extraNameservers = digCalls.flatMap((argv) =>
      argv.filter((a) => a.startsWith("@") && a !== `@${PINNED_NAMESERVER}`),
    );
    expect(extraNameservers).toEqual([]);

    // Over-rejection guard: the clean PTR in the same answer set still resolves.
    expect(beacons.map((b) => b.host)).toEqual([`studio.${zone}`]);
  });

  it("never lets a '+'-prefixed PTR answer reach dig argv", async () => {
    const { calls, beacons } = await runWideAreaWithHostilePtr(HOSTILE_PTR_OPTION);
    const zone = WIDE_AREA_DOMAIN.replace(/\.$/, "");

    // dig takes the query name as an operand; a '+' there is eaten as an option
    // and the query name collapses, so the slot must never start with one.
    const digOperands = collectMatching(
      calls,
      (c) => c[0] === "dig",
      (c) => c[c.length - 2] ?? "",
    );
    expect(digOperands.filter((arg) => arg.startsWith("+"))).toEqual([]);
    // Belt and braces across dig's whole prefix set.
    expect(digOperands.filter((arg) => /^[-@+]/.test(arg))).toEqual([]);

    expect(beacons.map((b) => b.host)).toEqual([`studio.${zone}`]);
  });

  // The regression a too-eager dig guard would cause. Only the LEADING character
  // is structural to dig — '@' and '+' anywhere else are ordinary bytes in a
  // name, and DNS-SD instance labels are free-form, so rejecting them outright
  // would drop well-formed peers while still reading as "hardened".
  it("still passes PTR answers with interior '@' or '+' through to dig", async () => {
    const calls: string[][] = [];
    const zone = WIDE_AREA_DOMAIN.replace(/\.$/, "");
    const serviceBase = `_remoteclaw-gw._tcp.${zone}`;
    const services = [
      `studio+lab.${serviceBase}`, // interior '+'
      `desk@home.${serviceBase}`, // interior '@'
      `plain-gw.${serviceBase}`, // interior '-'
    ];

    const run = vi.fn(async (argv: string[]) => {
      calls.push(argv);
      const cmd = argv[0];

      if (cmd === "dns-sd" && argv[1] === "-B") {
        return { stdout: "", stderr: "", code: 0, signal: null, killed: false };
      }
      if (cmd === "tailscale" && argv[1] === "status") {
        return {
          stdout: JSON.stringify({ Self: { TailscaleIPs: ["100.69.232.64"] } }),
          stderr: "",
          code: 0,
          signal: null,
          killed: false,
        };
      }
      if (cmd === "dig") {
        const qname = argv[argv.length - 2] ?? "";
        const qtype = argv[argv.length - 1] ?? "";
        if (qtype === "PTR" && qname === serviceBase) {
          return {
            stdout: `${services.map((s) => `${s}.`).join("\n")}\n`,
            stderr: "",
            code: 0,
            signal: null,
            killed: false,
          };
        }
        const idx = services.indexOf(qname);
        if (qtype === "SRV" && idx >= 0) {
          return {
            stdout: `0 0 1878${idx} host${idx}.${zone}.\n`,
            stderr: "",
            code: 0,
            signal: null,
            killed: false,
          };
        }
        return { stdout: "", stderr: "", code: 0, signal: null, killed: false };
      }
      throw new Error(`unexpected argv: ${argv.join(" ")}`);
    });

    const beacons = await discoverGatewayBeacons({
      platform: "darwin",
      timeoutMs: 1200,
      domains: [WIDE_AREA_DOMAIN],
      wideAreaDomain: WIDE_AREA_DOMAIN,
      run: run as unknown as typeof runCommandWithTimeout,
    });

    const srvOperands = collectMatching(
      calls,
      (c) => c[0] === "dig" && c[c.length - 1] === "SRV",
      (c) => c[c.length - 2] ?? "",
    );
    expect(srvOperands).toEqual(services);
    expect(beacons.map((b) => b.host)).toEqual([`host0.${zone}`, `host1.${zone}`, `host2.${zone}`]);
    expect(beacons.map((b) => b.instanceName)).toEqual(["studio+lab", "desk@home", "plain-gw"]);
  });

  it("normalizes domains and respects domains override", async () => {
    const calls: string[][] = [];
    const run = vi.fn(async (argv: string[]) => {
      calls.push(argv);
      return {
        stdout: "",
        stderr: "",
        code: 0,
        signal: null,
        killed: false,
      };
    });

    await discoverGatewayBeacons({
      platform: "darwin",
      timeoutMs: 1,
      domains: ["local", "remoteclaw.internal"],
      run: run as unknown as typeof runCommandWithTimeout,
    });

    const browseDomains = collectMatching(
      calls,
      (c) => c[1] === "-B",
      (c) => c[3],
    );
    expect(browseDomains).toContain("local.");
    expect(browseDomains).toContain("remoteclaw.internal.");

    calls.length = 0;
    await discoverGatewayBeacons({
      platform: "darwin",
      timeoutMs: 1,
      domains: ["local."],
      run: run as unknown as typeof runCommandWithTimeout,
    });

    expect(calls.reduce((count, c) => count + (c[1] === "-B" ? 1 : 0), 0)).toBe(1);
    expect(calls.find((c) => c[1] === "-B")?.[3]).toBe("local.");
  });
});
