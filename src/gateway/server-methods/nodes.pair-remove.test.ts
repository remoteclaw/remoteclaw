import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { approveNodePairing, getPairedNode, requestNodePairing } from "../../infra/node-pairing.js";
import { handleGatewayRequest } from "../server-methods.js";

const noWebchat = () => false;

type DispatchResult = {
  respond: ReturnType<typeof vi.fn>;
  logInfo: ReturnType<typeof vi.fn>;
};

// These tests dispatch through the real `handleGatewayRequest`, so they exercise
// the actual authorization gate AND the real (non-mocked) `node.pair.remove`
// handler against a durable on-disk store rooted at a per-test temp directory.
describe("gateway node.pair.remove handler", () => {
  let previousStateDir: string | undefined;

  beforeEach(async () => {
    previousStateDir = process.env.REMOTECLAW_STATE_DIR;
    const dir = await mkdtemp(join(tmpdir(), "remoteclaw-node-pair-remove-"));
    process.env.REMOTECLAW_STATE_DIR = dir;
  });

  afterEach(() => {
    if (previousStateDir === undefined) {
      delete process.env.REMOTECLAW_STATE_DIR;
    } else {
      process.env.REMOTECLAW_STATE_DIR = previousStateDir;
    }
    vi.restoreAllMocks();
  });

  async function seedPairedNode(nodeId: string): Promise<void> {
    const pending = await requestNodePairing({
      nodeId,
      platform: "darwin",
      commands: ["system.run"],
    });
    await approveNodePairing(pending.request.requestId, {
      callerScopes: ["operator.pairing", "operator.admin"],
    });
    expect(await getPairedNode(nodeId)).not.toBeNull();
  }

  async function dispatchRemove(params: {
    nodeId: string;
    scopes: string[];
  }): Promise<DispatchResult> {
    const respond = vi.fn();
    const logInfo = vi.fn();
    await handleGatewayRequest({
      req: {
        type: "req",
        id: crypto.randomUUID(),
        method: "node.pair.remove",
        params: { nodeId: params.nodeId },
      },
      respond,
      client: {
        connect: {
          role: "operator",
          scopes: params.scopes,
          client: {
            id: "remoteclaw-control-ui",
            version: "1.0.0",
            platform: "darwin",
            mode: "ui",
          },
          minProtocol: 1,
          maxProtocol: 1,
        },
        connId: "conn-1",
        clientIp: "10.0.0.5",
      } as Parameters<typeof handleGatewayRequest>[0]["client"],
      isWebchatConnect: noWebchat,
      context: {
        logGateway: { info: logInfo, warn: vi.fn() },
      } as unknown as Parameters<typeof handleGatewayRequest>[0]["context"],
    });
    return { respond, logInfo };
  }

  it("removes a paired node and clears it from the durable store", async () => {
    await seedPairedNode("node-1");

    const { respond, logInfo } = await dispatchRemove({
      nodeId: "node-1",
      scopes: ["operator.pairing"],
    });

    expect(respond).toHaveBeenCalledTimes(1);
    const [ok, payload, error] = respond.mock.calls[0];
    expect(ok).toBe(true);
    expect(error).toBeUndefined();
    expect((payload as { nodeId?: string })?.nodeId).toBe("node-1");
    expect(logInfo).toHaveBeenCalledWith(
      expect.stringContaining("node pairing removed node=node-1"),
    );
    expect(await getPairedNode("node-1")).toBeNull();
  });

  it("rejects callers lacking operator.pairing scope and leaves the node paired", async () => {
    await seedPairedNode("node-2");

    const { respond, logInfo } = await dispatchRemove({
      nodeId: "node-2",
      scopes: ["operator.read"],
    });

    const [ok, payload, error] = respond.mock.calls[0];
    expect(ok).toBe(false);
    expect(payload).toBeUndefined();
    expect((error as { message?: string })?.message).toContain("operator.pairing");
    // Authorization is enforced at the dispatch layer before the handler runs, so
    // an under-scoped caller must not remove the node nor emit the removal log.
    expect(logInfo).not.toHaveBeenCalled();
    expect(await getPairedNode("node-2")).not.toBeNull();
  });

  it("returns a not-found error for an unknown node without throwing", async () => {
    const { respond } = await dispatchRemove({
      nodeId: "ghost-node",
      scopes: ["operator.pairing"],
    });

    const [ok, payload, error] = respond.mock.calls[0];
    expect(ok).toBe(false);
    expect(payload).toBeUndefined();
    expect((error as { message?: string })?.message).toContain("unknown nodeId");
  });

  it("is idempotent: removing an already-removed node reports not-found gracefully", async () => {
    await seedPairedNode("node-3");

    const first = await dispatchRemove({ nodeId: "node-3", scopes: ["operator.pairing"] });
    expect(first.respond.mock.calls[0][0]).toBe(true);

    const second = await dispatchRemove({ nodeId: "node-3", scopes: ["operator.pairing"] });
    const [ok, , error] = second.respond.mock.calls[0];
    expect(ok).toBe(false);
    expect((error as { message?: string })?.message).toContain("unknown nodeId");
  });
});
