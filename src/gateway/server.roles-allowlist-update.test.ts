import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { WebSocket } from "ws";
import type { DeviceIdentity } from "../infra/device-identity.js";
import { resolveRestartSentinelPath } from "../infra/restart-sentinel.js";
import { GATEWAY_CLIENT_MODES, GATEWAY_CLIENT_NAMES } from "../utils/message-channel.js";
import type { GatewayClient } from "./client.js";
import { ConnectErrorDetailCodes } from "./protocol/connect-error-details.js";

vi.mock("../infra/update-runner.js", () => ({
  runGatewayUpdate: vi.fn(async () => ({
    status: "ok",
    mode: "git",
    root: "/repo",
    steps: [],
    durationMs: 12,
  })),
}));

import { runGatewayUpdate } from "../infra/update-runner.js";
import { connectGatewayClient } from "./test-helpers.e2e.js";
import { installGatewayTestHooks, onceMessage, rpcReq } from "./test-helpers.js";
import { installConnectedControlUiServerSuite } from "./test-with-server.js";

installGatewayTestHooks({ scope: "suite" });
const FAST_WAIT_OPTS = { timeout: 1_000, interval: 2 } as const;

let ws: WebSocket;
let port: number;

installConnectedControlUiServerSuite((started) => {
  ws = started.ws;
  port = started.port;
});

// Forwarding header that makes the gateway classify a loopback test connect as
// REMOTE (non-local-direct) via `isLocalDirectRequest` (src/gateway/auth.ts).
// A remote node connect requires EXPLICIT pairing approval instead of the
// secure-on-loopback silent auto-pair — which is exactly the path the
// pairing-required tests below need. This is a TEST-ONLY harness lever: it only
// passes the header through the existing WS upgrade; production classification
// and the loopback auto-pair posture are unchanged. 203.0.113.0/24 is the
// RFC 5737 TEST-NET-3 documentation range (never a real peer).
const REMOTE_PEER_HEADERS = { "x-forwarded-for": "203.0.113.10" } as const;

const connectNodeClient = async (params: {
  port: number;
  commands: string[];
  platform?: string;
  deviceFamily?: string;
  deviceIdentity?: DeviceIdentity;
  instanceId?: string;
  displayName?: string;
  onEvent?: (evt: { event?: string; payload?: unknown }) => void;
  headers?: Record<string, string>;
}) => {
  const token = process.env.REMOTECLAW_GATEWAY_TOKEN;
  if (!token) {
    throw new Error("REMOTECLAW_GATEWAY_TOKEN is required for node test clients");
  }
  return await connectGatewayClient({
    url: `ws://127.0.0.1:${params.port}`,
    token,
    role: "node",
    clientName: GATEWAY_CLIENT_NAMES.NODE_HOST,
    clientVersion: "1.0.0",
    clientDisplayName: params.displayName,
    platform: params.platform ?? "ios",
    deviceFamily: params.deviceFamily,
    mode: GATEWAY_CLIENT_MODES.NODE,
    instanceId: params.instanceId,
    scopes: [],
    commands: params.commands,
    deviceIdentity: params.deviceIdentity,
    onEvent: params.onEvent,
    headers: params.headers,
    timeoutMessage: "timeout waiting for node to connect",
  });
};

const approveAllPendingPairings = async () => {
  const { approveDevicePairing, listDevicePairing } = await import("../infra/device-pairing.js");
  const list = await listDevicePairing();
  for (const pending of list.pending) {
    await approveDevicePairing(pending.requestId);
  }
};

function getGatewayTestConfigPath(): string {
  const configPath = process.env.REMOTECLAW_CONFIG_PATH;
  if (!configPath) {
    throw new Error("REMOTECLAW_CONFIG_PATH is required in the gateway test environment");
  }
  return configPath;
}

const connectNodeClientWithPairing = async (params: Parameters<typeof connectNodeClient>[0]) => {
  try {
    return await connectNodeClient(params);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("pairing required")) {
      throw error;
    }
    await approveAllPendingPairings();
    return await connectNodeClient(params);
  }
};

const connectNodeClientWithNodePairing = async (
  params: Parameters<typeof connectNodeClient>[0],
) => {
  const provisionalClient = await connectNodeClientWithPairing(params);
  const listRes = await rpcReq<{
    nodes?: Array<{ nodeId: string; displayName?: string; connected?: boolean }>;
  }>(ws, "node.list", {});
  const provisionalNode = (listRes.payload?.nodes ?? []).find((node) => {
    if (!node.connected) {
      return false;
    }
    if (params.displayName) {
      return node.displayName === params.displayName;
    }
    return true;
  });
  const nodeId = provisionalNode?.nodeId ?? "";
  expect(nodeId).toBeTruthy();

  await provisionalClient.stopAndWait();

  const { approveNodePairing, requestNodePairing } = await import("../infra/node-pairing.js");
  const request = await requestNodePairing({
    nodeId,
    displayName: params.displayName,
    platform: params.platform ?? "ios",
    deviceFamily: params.deviceFamily,
    commands: params.commands,
  });
  await approveNodePairing(request.request.requestId, {
    callerScopes: ["operator.admin", "operator.write"],
  });

  return await connectNodeClient(params);
};

describe("gateway role enforcement", () => {
  test("enforces operator and node permissions", async () => {
    let nodeClient: GatewayClient | undefined;

    try {
      const eventRes = await rpcReq(ws, "node.event", { event: "test", payload: { ok: true } });
      expect(eventRes.ok).toBe(false);
      expect(eventRes.error?.message ?? "").toContain("unauthorized role");

      const invokeRes = await rpcReq(ws, "node.invoke.result", {
        id: "invoke-1",
        nodeId: "node-1",
        ok: true,
      });
      expect(invokeRes.ok).toBe(false);
      expect(invokeRes.error?.message ?? "").toContain("unauthorized role");

      nodeClient = await connectNodeClientWithPairing({
        port,
        commands: [],
        instanceId: "node-role-enforcement",
        displayName: "node-role-enforcement",
      });

      // NOTE: upstream asserted `skills.bins` returns a `bins[]` here, but
      // RemoteClaw gutted the skills-bins handler (Middleware Boundary) — the
      // method has no handler and is not in NODE_ROLE_METHODS, so a node calling
      // it is rejected "unauthorized role: node". The dropped assertion tested a
      // gutted capability; the surrounding node-authz checks (below) remain live.
      await expect(nodeClient.request("status", {})).rejects.toThrow("unauthorized role");

      const healthPayload = await nodeClient.request("health", {});
      expect(healthPayload).toBeDefined();
    } finally {
      nodeClient?.stop();
    }
  });
});

describe("gateway update.run", () => {
  test("writes sentinel and schedules restart", async () => {
    const sigusr1 = vi.fn();
    process.on("SIGUSR1", sigusr1);

    try {
      const id = "req-update";
      ws.send(
        JSON.stringify({
          type: "req",
          id,
          method: "update.run",
          params: {
            sessionKey: "agent:main:whatsapp:dm:+15555550123",
            restartDelayMs: 0,
          },
        }),
      );
      const res = await onceMessage(ws, (o) => o.type === "res" && o.id === id);
      expect(res.ok).toBe(true);

      await vi.waitFor(() => {
        expect(sigusr1.mock.calls.length).toBeGreaterThan(0);
      }, FAST_WAIT_OPTS);
      expect(sigusr1).toHaveBeenCalled();

      const sentinelPath = resolveRestartSentinelPath();
      const raw = await fs.readFile(sentinelPath, "utf-8");
      const parsed = JSON.parse(raw) as {
        payload?: { kind?: string; stats?: { mode?: string } };
      };
      expect(parsed.payload?.kind).toBe("update");
      expect(parsed.payload?.stats?.mode).toBe("git");
    } finally {
      process.off("SIGUSR1", sigusr1);
    }
  });

  test("uses configured update channel", async () => {
    const sigusr1 = vi.fn();
    process.on("SIGUSR1", sigusr1);

    try {
      const configPath = getGatewayTestConfigPath();
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(configPath, JSON.stringify({ update: { channel: "beta" } }, null, 2));
      const updateMock = vi.mocked(runGatewayUpdate);
      updateMock.mockClear();

      const id = "req-update-channel";
      ws.send(
        JSON.stringify({
          type: "req",
          id,
          method: "update.run",
          params: {
            restartDelayMs: 0,
          },
        }),
      );
      const res = await onceMessage(ws, (o) => o.type === "res" && o.id === id);
      expect(res.ok).toBe(true);
      expect(updateMock).toHaveBeenCalledOnce();
    } finally {
      process.off("SIGUSR1", sigusr1);
    }
  });
});

describe("gateway node command allowlist", () => {
  test("enforces command allowlists across node clients", async () => {
    const { loadOrCreateDeviceIdentity } = await import("../infra/device-identity.js");
    const waitForConnectedCount = async (count: number) => {
      await expect
        .poll(async () => {
          const listRes = await rpcReq<{
            nodes?: Array<{ nodeId: string; connected?: boolean }>;
          }>(ws, "node.list", {});
          const nodes = listRes.payload?.nodes ?? [];
          return nodes.filter((node) => node.connected).length;
        }, FAST_WAIT_OPTS)
        .toBe(count);
    };

    const getConnectedNodeId = async () => {
      const listRes = await rpcReq<{ nodes?: Array<{ nodeId: string; connected?: boolean }> }>(
        ws,
        "node.list",
        {},
      );
      const nodeId = listRes.payload?.nodes?.find((node) => node.connected)?.nodeId ?? "";
      expect(nodeId).toBeTruthy();
      return nodeId;
    };

    let systemClient: GatewayClient | undefined;
    let emptyClient: GatewayClient | undefined;
    let allowedClient: GatewayClient | undefined;

    try {
      const systemDeviceIdentity = loadOrCreateDeviceIdentity(
        path.join(os.tmpdir(), `remoteclaw-node-system-run-${Date.now()}-${Math.random()}.json`),
      );
      const emptyDeviceIdentity = loadOrCreateDeviceIdentity(
        path.join(os.tmpdir(), `remoteclaw-node-empty-${Date.now()}-${Math.random()}.json`),
      );
      const allowedDeviceIdentity = loadOrCreateDeviceIdentity(
        path.join(os.tmpdir(), `remoteclaw-node-allowed-${Date.now()}-${Math.random()}.json`),
      );

      systemClient = await connectNodeClientWithPairing({
        port,
        commands: ["system.run"],
        instanceId: "node-system-run",
        displayName: "node-system-run",
        deviceIdentity: systemDeviceIdentity,
      });
      const systemNodeId = await getConnectedNodeId();
      const disallowedRes = await rpcReq(ws, "node.invoke", {
        nodeId: systemNodeId,
        command: "system.run",
        params: { command: "echo hi" },
        idempotencyKey: "allowlist-1",
      });
      expect(disallowedRes.ok).toBe(false);
      expect(disallowedRes.error?.message).toContain("node command not allowed");
      await systemClient.stopAndWait();
      await waitForConnectedCount(0);

      emptyClient = await connectNodeClientWithPairing({
        port,
        commands: [],
        instanceId: "node-empty",
        displayName: "node-empty",
        deviceIdentity: emptyDeviceIdentity,
      });
      const emptyNodeId = await getConnectedNodeId();
      const missingRes = await rpcReq(ws, "node.invoke", {
        nodeId: emptyNodeId,
        command: "canvas.snapshot",
        params: {},
        idempotencyKey: "allowlist-2",
      });
      expect(missingRes.ok).toBe(false);
      expect(missingRes.error?.message).toContain("node command not allowed");
      await emptyClient.stopAndWait();
      await waitForConnectedCount(0);

      let resolveInvoke: ((payload: { id?: string; nodeId?: string }) => void) | null = null;
      const waitForInvoke = () =>
        new Promise<{ id?: string; nodeId?: string }>((resolve) => {
          resolveInvoke = resolve;
        });
      allowedClient = await connectNodeClientWithNodePairing({
        port,
        commands: ["canvas.snapshot"],
        instanceId: "node-allowed",
        displayName: "node-allowed",
        deviceIdentity: allowedDeviceIdentity,
        onEvent: (evt) => {
          if (evt.event === "node.invoke.request") {
            const payload = evt.payload as { id?: string; nodeId?: string };
            resolveInvoke?.(payload);
          }
        },
      });
      const allowedNodeId = await getConnectedNodeId();

      const invokeResP = rpcReq(ws, "node.invoke", {
        nodeId: allowedNodeId,
        command: "canvas.snapshot",
        params: { format: "png" },
        idempotencyKey: "allowlist-3",
      });
      const payload = await waitForInvoke();
      const requestId = payload?.id ?? "";
      const nodeIdFromReq = payload?.nodeId ?? "node-allowed";
      await allowedClient.request("node.invoke.result", {
        id: requestId,
        nodeId: nodeIdFromReq,
        ok: true,
        payloadJSON: JSON.stringify({ ok: true }),
      });
      const invokeRes = await invokeResP;
      expect(invokeRes.ok).toBe(true);

      const invokeNullResP = rpcReq(ws, "node.invoke", {
        nodeId: allowedNodeId,
        command: "canvas.snapshot",
        params: { format: "png" },
        idempotencyKey: "allowlist-null-payloadjson",
      });
      const payloadNull = await waitForInvoke();
      const requestIdNull = payloadNull?.id ?? "";
      const nodeIdNull = payloadNull?.nodeId ?? "node-allowed";
      await allowedClient.request("node.invoke.result", {
        id: requestIdNull,
        nodeId: nodeIdNull,
        ok: true,
        payloadJSON: null,
      });
      const invokeNullRes = await invokeNullResP;
      expect(invokeNullRes.ok).toBe(true);
    } finally {
      await systemClient?.stopAndWait();
      await emptyClient?.stopAndWait();
      await allowedClient?.stopAndWait();
    }
  });

  // SKIPPED — blocked by gutted PRODUCTION wiring, not a harness gap (see
  // remoteclaw/remoteclaw#2744). This asserts a node's allowlist-filtered
  // declared commands appear in the `node.pair.list` PENDING set (the
  // NODE-pairing system, distinct from device pairing) on connect. Upstream
  // OpenClaw runs `reconcileNodePairingOnConnect` at connect time to park that
  // node-pairing pending entry; the RemoteClaw fork gutted that wiring —
  // `reconcileNodePairingOnConnect` has no call site (only its definition
  // remains), and `node.pair.list.pending` is written ONLY by the explicit
  // `node.pair.request` RPC, never on connect. So the pending entry is empty
  // regardless of local-vs-remote classification: a remote connect
  // (REMOTE_PEER_HEADERS) parks only a DEVICE-pairing entry — proven by
  // "requires explicit pairing approval for a remote (non-local-direct) node
  // connect" above, which exercises the harness's new remote-connect lever. The
  // connect-time allowlist FILTERING this checks is still covered by "filters
  // system.run for confusable iOS metadata at connect time" (reads node.list).
  // Re-enabling needs restoring the gutted connect→node-pairing reconciliation
  // (a production port, out of this PR's harness-only scope): #2744.
  test.skip("keeps allowlisted declared commands available before node pairing exists", async () => {
    const findConnectedNode = async (displayName: string) => {
      const listRes = await rpcReq<{
        nodes?: Array<{
          nodeId: string;
          displayName?: string;
          connected?: boolean;
          commands?: string[];
        }>;
      }>(ws, "node.list", {});
      return (listRes.payload?.nodes ?? []).find(
        (node) => node.connected && node.displayName === displayName,
      );
    };

    const displayName = "node-device-paired-only";
    let nodeClient: GatewayClient | undefined;

    try {
      nodeClient = await connectNodeClientWithPairing({
        port,
        commands: ["canvas.snapshot", "system.run"],
        platform: "darwin",
        instanceId: displayName,
        displayName,
      });

      await expect
        .poll(async () => {
          const node = await findConnectedNode(displayName);
          return node?.commands?.toSorted() ?? [];
        }, FAST_WAIT_OPTS)
        .toEqual(["canvas.snapshot", "system.run"]);

      const node = await findConnectedNode(displayName);
      const nodeId = node?.nodeId ?? "";
      expect(nodeId).toBeTruthy();

      const pairingList = await rpcReq<{
        pending?: Array<{ nodeId?: string; commands?: string[] }>;
      }>(ws, "node.pair.list", {});
      expect(pairingList.ok).toBe(true);
      expect(pairingList.payload?.pending ?? []).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            nodeId,
            commands: ["canvas.snapshot", "system.run"],
          }),
        ]),
      );
    } finally {
      await nodeClient?.stopAndWait();
    }
  });

  // SKIPPED — same gutted-wiring blocker as the sibling above, not a harness gap
  // (remoteclaw/remoteclaw#2744): the `node.pair.list` PENDING entry this asserts
  // on is never created on connect because `reconcileNodePairingOnConnect` is
  // unwired in the fork. The İOS-confusable allowlist filtering it checks (only
  // `canvas.snapshot` survives, `system.run` filtered) is exercised at connect
  // time by "filters system.run for confusable iOS metadata at connect time" via
  // node.list. Re-enabling needs the production port tracked in #2744.
  test.skip("records only allowlisted commands in pending node pairing requests", async () => {
    const { loadOrCreateDeviceIdentity } = await import("../infra/device-identity.js");
    const deviceIdentityPath = path.join(
      os.tmpdir(),
      `remoteclaw-allowlisted-pending-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
    const deviceIdentity = loadOrCreateDeviceIdentity(deviceIdentityPath);
    const displayName = "node-pending-allowlisted-only";
    let nodeClient: GatewayClient | undefined;

    try {
      nodeClient = await connectNodeClientWithPairing({
        port,
        commands: ["system.run", "canvas.snapshot"],
        platform: "İOS",
        deviceFamily: "iPhone",
        instanceId: displayName,
        displayName,
        deviceIdentity,
      });

      const listRes = await rpcReq<{
        nodes?: Array<{
          nodeId: string;
          displayName?: string;
          connected?: boolean;
        }>;
      }>(ws, "node.list", {});
      const nodeId =
        (listRes.payload?.nodes ?? []).find(
          (node) => node.connected && node.displayName === displayName,
        )?.nodeId ?? "";
      expect(nodeId).toBeTruthy();

      const pairingList = await rpcReq<{
        pending?: Array<{ nodeId?: string; commands?: string[] }>;
      }>(ws, "node.pair.list", {});
      expect(pairingList.ok).toBe(true);
      expect(pairingList.payload?.pending ?? []).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            nodeId,
            commands: ["canvas.snapshot"],
          }),
        ]),
      );
    } finally {
      await nodeClient?.stopAndWait();
    }
  });

  // AC#1 (remoteclaw#2732): the harness can now originate a node connect that the
  // gateway classifies as REMOTE (non-local-direct) by attaching a forwarding
  // header (REMOTE_PEER_HEADERS) that flips `isLocalDirectRequest`
  // (src/gateway/auth.ts) to false. A remote node connect must NOT take the
  // secure-on-loopback silent auto-pair shortcut: it is rejected with
  // PAIRING_REQUIRED and parks a pending DEVICE-pairing entry for explicit
  // approval. Every other node connect in this suite uses loopback (no header)
  // and silently auto-pairs — this test is the contrasting remote path. The
  // header is a TEST-ONLY harness lever; production classification and the
  // loopback auto-pair posture are unchanged.
  test("requires explicit pairing approval for a remote (non-local-direct) node connect", async () => {
    const { listDevicePairing, rejectDevicePairing } = await import("../infra/device-pairing.js");
    const { loadOrCreateDeviceIdentity } = await import("../infra/device-identity.js");
    const deviceIdentity = loadOrCreateDeviceIdentity(
      path.join(
        os.tmpdir(),
        `remoteclaw-remote-node-pairing-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
      ),
    );
    const displayName = "node-remote-pairing-required";

    let connectError: unknown;
    try {
      await connectNodeClient({
        port,
        commands: ["canvas.snapshot"],
        platform: "darwin",
        instanceId: displayName,
        displayName,
        deviceIdentity,
        headers: REMOTE_PEER_HEADERS,
      });
      throw new Error("expected remote node connect to require explicit pairing");
    } catch (err) {
      connectError = err;
    }

    // Assert the structured PAIRING_REQUIRED code rather than the rendered
    // message so the contract is robust to wording (same convention as the
    // spoof test below).
    const detailCode = (connectError as { details?: { code?: string } } | undefined)?.details?.code;
    expect(detailCode).toBe(ConnectErrorDetailCodes.PAIRING_REQUIRED);

    // The explicit-pairing path parked exactly one pending DEVICE-pairing entry
    // for this node's device identity (the loopback silent auto-pair did NOT
    // fire), recording the "node" role it connected with.
    const pending = (await listDevicePairing()).pending.filter(
      (entry) => entry.deviceId === deviceIdentity.deviceId,
    );
    expect(pending).toHaveLength(1);
    const pendingRoles = pending[0]?.roles ?? (pending[0]?.role ? [pending[0]?.role] : []);
    expect(pendingRoles).toContain("node");

    // Clean up the pending entry so it cannot leak into sibling tests (the suite
    // shares device-pairing state — there is no per-test reset).
    const requestId = pending[0]?.requestId;
    if (requestId) {
      await rejectDevicePairing(requestId);
    }
  });

  test("rejects reconnect metadata spoof for paired node devices", async () => {
    const { loadOrCreateDeviceIdentity } = await import("../infra/device-identity.js");
    const deviceIdentityPath = path.join(
      os.tmpdir(),
      `remoteclaw-spoof-test-device-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
    const deviceIdentity = loadOrCreateDeviceIdentity(deviceIdentityPath);

    let iosClient: GatewayClient | undefined;
    try {
      iosClient = await connectNodeClientWithPairing({
        port,
        commands: ["canvas.snapshot"],
        platform: "ios",
        deviceFamily: "iPhone",
        instanceId: "node-platform-pin",
        displayName: "node-platform-pin",
        deviceIdentity,
      });
      await iosClient.stopAndWait();
      await expect
        .poll(async () => {
          const listRes = await rpcReq<{ nodes?: Array<{ connected?: boolean }> }>(
            ws,
            "node.list",
            {},
          );
          return (listRes.payload?.nodes ?? []).filter((node) => node.connected).length;
        }, FAST_WAIT_OPTS)
        .toBe(0);

      // The reconnect with spoofed platform/deviceFamily must be rejected. The
      // server returns code PAIRING_REQUIRED with reason "metadata-upgrade"
      // (forcing non-silent re-approval); the client surfaces that as the
      // metadata-upgrade message ("device metadata change pending approval"),
      // which is the correct secure outcome. Assert the structured detail code
      // rather than the rendered prose so the contract is robust to message
      // wording (the rejection is what matters, not the exact string).
      let spoofError: unknown;
      try {
        await connectNodeClient({
          port,
          commands: ["system.run"],
          platform: "linux",
          deviceFamily: "linux",
          instanceId: "node-platform-pin",
          displayName: "node-platform-pin",
          deviceIdentity,
        });
        throw new Error("expected spoofed metadata reconnect to be rejected");
      } catch (err) {
        spoofError = err;
      }
      const detailCode = (spoofError as { details?: { code?: string } } | undefined)?.details?.code;
      expect(detailCode).toBe(ConnectErrorDetailCodes.PAIRING_REQUIRED);
    } finally {
      await iosClient?.stopAndWait();
    }
  });

  test("filters system.run for confusable iOS metadata at connect time", async () => {
    const { loadOrCreateDeviceIdentity } = await import("../infra/device-identity.js");
    const cases = [
      {
        label: "dotted-i-platform",
        platform: "İOS",
        deviceFamily: "iPhone",
      },
      {
        label: "greek-omicron-family",
        platform: "ios",
        deviceFamily: "iPhοne",
      },
    ] as const;

    for (const testCase of cases) {
      const deviceIdentityPath = path.join(
        os.tmpdir(),
        `remoteclaw-confusable-node-${testCase.label}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
      );
      const deviceIdentity = loadOrCreateDeviceIdentity(deviceIdentityPath);
      const displayName = `node-${testCase.label}`;

      const findConnectedNode = async () => {
        const listRes = await rpcReq<{
          nodes?: Array<{
            nodeId: string;
            displayName?: string;
            connected?: boolean;
            commands?: string[];
          }>;
        }>(ws, "node.list", {});
        return (listRes.payload?.nodes ?? []).find(
          (node) => node.connected && node.displayName === displayName,
        );
      };

      let client: GatewayClient | undefined;
      try {
        client = await connectNodeClientWithNodePairing({
          port,
          commands: ["system.run", "canvas.snapshot"],
          platform: testCase.platform,
          deviceFamily: testCase.deviceFamily,
          instanceId: displayName,
          displayName,
          deviceIdentity,
        });

        await expect
          .poll(
            async () => {
              const node = await findConnectedNode();
              return node?.commands?.toSorted() ?? [];
            },
            { timeout: 2_000, interval: 10 },
          )
          .toEqual(["canvas.snapshot"]);

        const node = await findConnectedNode();
        const nodeId = node?.nodeId ?? "";
        expect(nodeId).toBeTruthy();

        const systemRunRes = await rpcReq(ws, "node.invoke", {
          nodeId,
          command: "system.run",
          params: { command: "echo blocked" },
          idempotencyKey: `allowlist-confusable-${testCase.label}`,
        });
        expect(systemRunRes.ok).toBe(false);
        expect(systemRunRes.error?.message ?? "").toContain("node command not allowed");
      } finally {
        await client?.stopAndWait();
      }
    }
  });
});
