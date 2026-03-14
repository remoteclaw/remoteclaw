import { generateKeyPairSync } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadApnsRegistration,
  normalizeApnsEnvironment,
  registerApnsToken,
  resolveApnsAuthConfigFromEnv,
  sendApnsAlert,
  sendApnsBackgroundWake,
} from "./push-apns.js";

const tempDirs: string[] = [];
const testAuthPrivateKey = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
  .privateKey.export({ format: "pem", type: "pkcs8" })
  .toString();

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "remoteclaw-push-apns-test-"));
  tempDirs.push(dir);
  return dir;
}

function createRelayApnsSendFixture(params: {
  nodeId: string;
  relayHandle?: string;
  tokenDebugSuffix?: string;
  sendResult: {
    ok: boolean;
    status: number;
    environment: "production";
    apnsId?: string;
    reason?: string;
    tokenSuffix?: string;
  };
}) {
  return {
    send: vi.fn().mockResolvedValue(params.sendResult),
    registration: {
      nodeId: params.nodeId,
      transport: "relay" as const,
      relayHandle: params.relayHandle ?? "relay-handle-12345678",
      sendGrant: "send-grant-123",
      installationId: "install-123",
      topic: "ai.openclaw.ios",
      environment: "production" as const,
      distribution: "official" as const,
      updatedAtMs: 1,
      tokenDebugSuffix: params.tokenDebugSuffix,
    },
    relayConfig: {
      baseUrl: "https://relay.openclaw.test",
      timeoutMs: 2_500,
    },
    gatewayIdentity: {
      deviceId: "gateway-device-1",
      privateKeyPem: testAuthPrivateKey,
    },
  };
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
});

describe("push APNs registration store", () => {
  it("stores and reloads node APNs registration", async () => {
    const baseDir = await makeTempDir();
    const saved = await registerApnsToken({
      nodeId: "ios-node-1",
      token: "ABCD1234ABCD1234ABCD1234ABCD1234",
      topic: "org.remoteclaw.ios",
      environment: "sandbox",
      baseDir,
    });

    const loaded = await loadApnsRegistration("ios-node-1", baseDir);
    expect(loaded).not.toBeNull();
    expect(loaded?.nodeId).toBe("ios-node-1");
    expect(loaded?.token).toBe("abcd1234abcd1234abcd1234abcd1234");
    expect(loaded?.topic).toBe("org.remoteclaw.ios");
    expect(loaded?.environment).toBe("sandbox");
    expect(loaded?.updatedAtMs).toBe(saved.updatedAtMs);
  });

  it("rejects invalid APNs tokens", async () => {
    const baseDir = await makeTempDir();
    await expect(
      registerApnsToken({
        nodeId: "ios-node-1",
        token: "not-a-token",
        topic: "org.remoteclaw.ios",
        baseDir,
      }),
    ).rejects.toThrow("invalid APNs token");
  });
});

describe("push APNs env config", () => {
  it("normalizes APNs environment values", () => {
    expect(normalizeApnsEnvironment("sandbox")).toBe("sandbox");
    expect(normalizeApnsEnvironment("PRODUCTION")).toBe("production");
    expect(normalizeApnsEnvironment("staging")).toBeNull();
  });

  it("resolves inline private key and unescapes newlines", async () => {
    const env = {
      REMOTECLAW_APNS_TEAM_ID: "TEAM123",
      REMOTECLAW_APNS_KEY_ID: "KEY123",
      REMOTECLAW_APNS_PRIVATE_KEY_P8:
        "-----BEGIN PRIVATE KEY-----\\nline-a\\nline-b\\n-----END PRIVATE KEY-----", // pragma: allowlist secret
    } as NodeJS.ProcessEnv;
    const resolved = await resolveApnsAuthConfigFromEnv(env);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) {
      return;
    }
    expect(resolved.value.privateKey).toContain("\nline-a\n");
    expect(resolved.value.teamId).toBe("TEAM123");
    expect(resolved.value.keyId).toBe("KEY123");
  });

  it("returns an error when required APNs auth vars are missing", async () => {
    const resolved = await resolveApnsAuthConfigFromEnv({} as NodeJS.ProcessEnv);
    expect(resolved.ok).toBe(false);
    if (resolved.ok) {
      return;
    }
    expect(resolved.error).toContain("REMOTECLAW_APNS_TEAM_ID");
  });
});

describe("push APNs send semantics", () => {
  it("sends alert pushes with alert headers and payload", async () => {
    const send = vi.fn().mockResolvedValue({
      status: 200,
      apnsId: "apns-alert-id",
      body: "",
    });

    const result = await sendApnsAlert({
      auth: {
        teamId: "TEAM123",
        keyId: "KEY123",
        privateKey: testAuthPrivateKey,
      },
      registration: {
        nodeId: "ios-node-alert",
        token: "ABCD1234ABCD1234ABCD1234ABCD1234",
        topic: "org.remoteclaw.ios",
        environment: "sandbox",
        updatedAtMs: 1,
      },
      nodeId: "ios-node-alert",
      title: "Wake",
      body: "Ping",
      requestSender: send,
    });

    expect(send).toHaveBeenCalledTimes(1);
    const sent = send.mock.calls[0]?.[0];
    expect(sent?.pushType).toBe("alert");
    expect(sent?.priority).toBe("10");
    expect(sent?.payload).toMatchObject({
      aps: {
        alert: { title: "Wake", body: "Ping" },
        sound: "default",
      },
      remoteclaw: {
        kind: "push.test",
        nodeId: "ios-node-alert",
      },
    });
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
  });

  it("sends background wake pushes with silent payload semantics", async () => {
    const send = vi.fn().mockResolvedValue({
      status: 200,
      apnsId: "apns-wake-id",
      body: "",
    });

    const result = await sendApnsBackgroundWake({
      auth: {
        teamId: "TEAM123",
        keyId: "KEY123",
        privateKey: testAuthPrivateKey,
      },
      registration: {
        nodeId: "ios-node-wake",
        token: "ABCD1234ABCD1234ABCD1234ABCD1234",
        topic: "org.remoteclaw.ios",
        environment: "production",
        updatedAtMs: 1,
      },
      nodeId: "ios-node-wake",
      wakeReason: "node.invoke",
      requestSender: send,
    });

    expect(send).toHaveBeenCalledTimes(1);
    const sent = send.mock.calls[0]?.[0];
    expect(sent?.pushType).toBe("background");
    expect(sent?.priority).toBe("5");
    expect(sent?.payload).toMatchObject({
      aps: {
        "content-available": 1,
      },
      remoteclaw: {
        kind: "node.wake",
        reason: "node.invoke",
        nodeId: "ios-node-wake",
      },
    });
    const sentPayload = sent?.payload as { aps?: { alert?: unknown; sound?: unknown } } | undefined;
    const aps = sentPayload?.aps;
    expect(aps?.alert).toBeUndefined();
    expect(aps?.sound).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(result.environment).toBe("production");
  });

  it("parses direct send failures and clamps sub-second timeouts", async () => {
    const { send, registration, auth } = createDirectApnsSendFixture({
      nodeId: "ios-node-direct-fail",
      environment: "sandbox",
      sendResult: {
        status: 400,
        apnsId: "apns-direct-fail-id",
        body: '{"reason":" BadDeviceToken "}',
      },
    });

    const result = await sendApnsAlert({
      registration,
      nodeId: "ios-node-direct-fail",
      title: "Wake",
      body: "Ping",
      auth,
      requestSender: send,
      timeoutMs: 50,
    });

    expect(send.mock.calls[0]?.[0]?.timeoutMs).toBe(1000);
    expect(result).toMatchObject({
      ok: false,
      status: 400,
      apnsId: "apns-direct-fail-id",
      reason: "BadDeviceToken",
      tokenSuffix: "abcd1234",
      transport: "direct",
    });
  });

  it("fails closed before sending when direct registrations carry invalid topics", async () => {
    const { send, registration, auth } = createDirectApnsSendFixture({
      nodeId: "ios-node-invalid-topic",
      environment: "sandbox",
      sendResult: {
        status: 200,
        apnsId: "unused",
        body: "",
      },
    });

    await expect(
      sendApnsAlert({
        registration: { ...registration, topic: "   " },
        nodeId: "ios-node-invalid-topic",
        title: "Wake",
        body: "Ping",
        auth,
        requestSender: send,
      }),
    ).rejects.toThrow("topic required");

    expect(send).not.toHaveBeenCalled();
  });

  it("defaults background wake reason when not provided", async () => {
    const send = vi.fn().mockResolvedValue({
      status: 200,
      apnsId: "apns-wake-default-reason-id",
      body: "",
    });

    await sendApnsBackgroundWake({
      auth: {
        teamId: "TEAM123",
        keyId: "KEY123",
        privateKey: testAuthPrivateKey,
      },
      registration: {
        nodeId: "ios-node-wake-default-reason",
        token: "ABCD1234ABCD1234ABCD1234ABCD1234",
        topic: "org.remoteclaw.ios",
        environment: "sandbox",
        updatedAtMs: 1,
      },
      nodeId: "ios-node-wake-default-reason",
      requestSender: send,
    });

    const sent = send.mock.calls[0]?.[0];
    expect(sent?.payload).toMatchObject({
      remoteclaw: {
        kind: "node.wake",
        reason: "node.invoke",
        nodeId: "ios-node-wake-default-reason",
      },
    });
  });

  it("sends relay alert pushes and falls back to the stored token debug suffix", async () => {
    const { send, registration, relayConfig, gatewayIdentity } = createRelayApnsSendFixture({
      nodeId: "ios-node-relay-alert",
      tokenDebugSuffix: "deadbeef",
      sendResult: {
        ok: true,
        status: 202,
        apnsId: "relay-alert-id",
        environment: "production",
      },
    });

    const result = await sendApnsAlert({
      registration,
      nodeId: "ios-node-relay-alert",
      title: "Wake",
      body: "Ping",
      relayConfig,
      relayGatewayIdentity: gatewayIdentity,
      relayRequestSender: send,
    });

    expect(send).toHaveBeenCalledTimes(1);
    const sent = send.mock.calls[0]?.[0];
    expect(sent).toMatchObject({
      relayConfig,
      sendGrant: "send-grant-123",
      relayHandle: "relay-handle-12345678",
      gatewayDeviceId: "gateway-device-1",
      pushType: "alert",
      priority: "10",
      payload: {
        aps: {
          alert: { title: "Wake", body: "Ping" },
          sound: "default",
        },
      },
    });
    expect(sent?.signature).toEqual(expect.any(String));
    expect(result).toMatchObject({
      ok: true,
      status: 202,
      apnsId: "relay-alert-id",
      tokenSuffix: "deadbeef",
      environment: "production",
      transport: "relay",
    });
  });

  it("sends relay background pushes and falls back to the relay handle suffix", async () => {
    const { send, registration, relayConfig, gatewayIdentity } = createRelayApnsSendFixture({
      nodeId: "ios-node-relay-wake",
      tokenDebugSuffix: undefined,
      sendResult: {
        ok: false,
        status: 429,
        reason: "TooManyRequests",
        environment: "production",
      },
    });

    const result = await sendApnsBackgroundWake({
      registration,
      nodeId: "ios-node-relay-wake",
      wakeReason: "queue.retry",
      relayConfig,
      relayGatewayIdentity: gatewayIdentity,
      relayRequestSender: send,
    });

    expect(send).toHaveBeenCalledTimes(1);
    const sent = send.mock.calls[0]?.[0];
    expect(sent).toMatchObject({
      relayConfig,
      sendGrant: "send-grant-123",
      relayHandle: "relay-handle-12345678",
      gatewayDeviceId: "gateway-device-1",
      pushType: "background",
      priority: "5",
      payload: {
        aps: { "content-available": 1 },
        openclaw: {
          kind: "node.wake",
          reason: "queue.retry",
          nodeId: "ios-node-relay-wake",
        },
      },
    });
    expect(result).toMatchObject({
      ok: false,
      status: 429,
      reason: "TooManyRequests",
      tokenSuffix: "12345678",
      environment: "production",
      transport: "relay",
    });
  });
});
