import { generateKeyPairSync } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadApnsRegistration,
  registerApnsToken,
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

function createDirectApnsSendFixture(params: {
  nodeId: string;
  environment: "sandbox" | "production";
  sendResult: { status: number; apnsId: string; body: string };
}) {
  return {
    send: vi.fn().mockResolvedValue(params.sendResult),
    registration: {
      nodeId: params.nodeId,
      transport: "direct" as const,
      token: "ABCD1234ABCD1234ABCD1234ABCD1234",
      topic: "org.remoteclaw.ios",
      environment: params.environment,
      updatedAtMs: 1,
    },
    auth: {
      teamId: "TEAM123",
      keyId: "KEY123",
      privateKey: testAuthPrivateKey,
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

describe("push APNs send semantics", () => {
  it("sends alert pushes with alert headers and payload", async () => {
    const { send, registration, auth } = createDirectApnsSendFixture({
      nodeId: "ios-node-alert",
      environment: "sandbox",
      sendResult: {
        status: 200,
        apnsId: "apns-alert-id",
        body: "",
      },
    });

    const result = await sendApnsAlert({
      registration,
      nodeId: "ios-node-alert",
      title: "Wake",
      body: "Ping",
      auth,
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
    const { send, registration, auth } = createDirectApnsSendFixture({
      nodeId: "ios-node-wake",
      environment: "production",
      sendResult: {
        status: 200,
        apnsId: "apns-wake-id",
        body: "",
      },
    });

    const result = await sendApnsBackgroundWake({
      registration,
      nodeId: "ios-node-wake",
      wakeReason: "node.invoke",
      auth,
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

  it("defaults background wake reason when not provided", async () => {
    const { send, registration, auth } = createDirectApnsSendFixture({
      nodeId: "ios-node-wake-default-reason",
      environment: "sandbox",
      sendResult: {
        status: 200,
        apnsId: "apns-wake-default-reason-id",
        body: "",
      },
    });

    await sendApnsBackgroundWake({
      registration,
      nodeId: "ios-node-wake-default-reason",
      auth,
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
});
