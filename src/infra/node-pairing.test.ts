import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  approveNodePairing,
  getPairedNode,
  listNodePairing,
  loadNodePairingStateForTest,
  rejectNodePairing,
  removePairedNode,
  renamePairedNode,
  requestNodePairing,
  updatePairedNodeMetadata,
  verifyNodeToken,
} from "./node-pairing.js";
import { resolvePairingPaths } from "./pairing-files.js";

async function setupPairedNode(baseDir: string): Promise<string> {
  const request = await requestNodePairing(
    {
      nodeId: "node-1",
      platform: "darwin",
      commands: ["system.run"],
    },
    baseDir,
  );
  await approveNodePairing(
    request.request.requestId,
    { callerScopes: ["operator.pairing", "operator.admin"] },
    baseDir,
  );
  const paired = await getPairedNode("node-1", baseDir);
  expect(typeof paired?.token).toBe("string");
  expect(paired?.token.length).toBeGreaterThan(0);
  return paired!.token;
}

describe("node pairing tokens", () => {
  test("reuses existing pending requests for the same node", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "remoteclaw-node-pairing-"));
    const first = await requestNodePairing(
      {
        nodeId: "node-1",
        platform: "darwin",
      },
      baseDir,
    );
    const second = await requestNodePairing(
      {
        nodeId: "node-1",
        platform: "darwin",
      },
      baseDir,
    );

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.request.requestId).toBe(first.request.requestId);
  });

  test("refreshes pending requests with newer commands", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "remoteclaw-node-pairing-"));
    const first = await requestNodePairing(
      {
        nodeId: "node-1",
        platform: "darwin",
        commands: ["canvas.snapshot"],
      },
      baseDir,
    );

    const second = await requestNodePairing(
      {
        nodeId: "node-1",
        platform: "darwin",
        displayName: "Updated Node",
        commands: ["canvas.snapshot", "system.run"],
      },
      baseDir,
    );
    const third = await requestNodePairing(
      {
        nodeId: "node-1",
        platform: "darwin",
        displayName: "Updated Node",
        commands: ["canvas.snapshot", "system.run", "system.which"],
      },
      baseDir,
    );

    expect(second.created).toBe(false);
    expect(second.request.requestId).toBe(first.request.requestId);
    expect(third.created).toBe(false);
    expect(third.request.requestId).toBe(second.request.requestId);
    expect(third.request.displayName).toBe("Updated Node");
    expect(third.request.commands).toEqual(["canvas.snapshot", "system.run", "system.which"]);
  });

  test("generates base64url node tokens with 256-bit entropy output length", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "remoteclaw-node-pairing-"));
    const token = await setupPairedNode(baseDir);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
  });

  test("verifies token and rejects mismatches", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "remoteclaw-node-pairing-"));
    const token = await setupPairedNode(baseDir);
    await expect(verifyNodeToken("node-1", token, baseDir)).resolves.toEqual({
      ok: true,
      node: expect.objectContaining({ nodeId: "node-1" }),
    });
    await expect(verifyNodeToken("node-1", "x".repeat(token.length), baseDir)).resolves.toEqual({
      ok: false,
    });
  });

  test("treats multibyte same-length token input as mismatch without throwing", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "remoteclaw-node-pairing-"));
    const token = await setupPairedNode(baseDir);
    const multibyteToken = "é".repeat(token.length);
    expect(Buffer.from(multibyteToken).length).not.toBe(Buffer.from(token).length);

    await expect(verifyNodeToken("node-1", multibyteToken, baseDir)).resolves.toEqual({
      ok: false,
    });
  });

  test("requires operator.admin to approve system.run node commands", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "remoteclaw-node-pairing-"));
    const request = await requestNodePairing(
      {
        nodeId: "node-1",
        platform: "darwin",
        commands: ["system.run"],
      },
      baseDir,
    );

    await expect(
      approveNodePairing(
        request.request.requestId,
        { callerScopes: ["operator.pairing"] },
        baseDir,
      ),
    ).resolves.toEqual({
      status: "forbidden",
      missingScope: "operator.admin",
    });
    await expect(getPairedNode("node-1", baseDir)).resolves.toBeNull();
  });

  test("requires operator.write to approve non-exec node commands", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "remoteclaw-node-pairing-"));
    const request = await requestNodePairing(
      {
        nodeId: "node-1",
        platform: "darwin",
        commands: ["canvas.present"],
      },
      baseDir,
    );

    await expect(
      approveNodePairing(
        request.request.requestId,
        { callerScopes: ["operator.pairing"] },
        baseDir,
      ),
    ).resolves.toEqual({
      status: "forbidden",
      missingScope: "operator.write",
    });
    await expect(
      approveNodePairing(request.request.requestId, { callerScopes: ["operator.write"] }, baseDir),
    ).resolves.toEqual({
      status: "forbidden",
      missingScope: "operator.pairing",
    });
    await expect(
      approveNodePairing(
        request.request.requestId,
        { callerScopes: ["operator.pairing", "operator.write"] },
        baseDir,
      ),
    ).resolves.toEqual({
      requestId: request.request.requestId,
      node: expect.objectContaining({
        nodeId: "node-1",
        commands: ["canvas.present"],
      }),
    });
  });

  test("requires operator.pairing to approve commandless node requests", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "remoteclaw-node-pairing-"));
    const request = await requestNodePairing(
      {
        nodeId: "node-1",
        platform: "darwin",
      },
      baseDir,
    );

    await expect(
      approveNodePairing(request.request.requestId, { callerScopes: [] }, baseDir),
    ).resolves.toEqual({
      status: "forbidden",
      missingScope: "operator.pairing",
    });
    await expect(
      approveNodePairing(
        request.request.requestId,
        { callerScopes: ["operator.pairing"] },
        baseDir,
      ),
    ).resolves.toEqual({
      requestId: request.request.requestId,
      node: expect.objectContaining({
        nodeId: "node-1",
        commands: undefined,
      }),
    });
  });

  test("lists pending requests with precomputed approval scopes", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "remoteclaw-node-pairing-"));
    await requestNodePairing(
      {
        nodeId: "node-1",
        platform: "darwin",
        commands: ["canvas.present"],
      },
      baseDir,
    );

    await expect(listNodePairing(baseDir)).resolves.toEqual({
      pending: [
        expect.objectContaining({
          nodeId: "node-1",
          commands: ["canvas.present"],
          requiredApproveScopes: ["operator.pairing", "operator.write"],
        }),
      ],
      paired: [],
    });
  });

  test("refuses to overwrite corrupt paired node state when requesting pairing", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "remoteclaw-node-pairing-"));
    const { dir, pairedPath } = resolvePairingPaths(baseDir, "nodes");
    await mkdir(dir, { recursive: true });
    await writeFile(pairedPath, "{not-json}", "utf8");

    await expect(
      requestNodePairing(
        {
          nodeId: "node-1",
          platform: "darwin",
        },
        baseDir,
      ),
    ).rejects.toThrow(/paired\.json/);
    await expect(readFile(pairedPath, "utf8")).resolves.toBe("{not-json}");
  });
});

describe("node pairing prototype-key hardening", () => {
  const dangerousKeys = ["__proto__", "constructor", "prototype"] as const;

  test("read paths do not resolve special prototype keys to inherited values", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "remoteclaw-node-pairing-"));
    for (const key of dangerousKeys) {
      await expect(getPairedNode(key, baseDir)).resolves.toBeNull();
      await expect(verifyNodeToken(key, "any-token", baseDir)).resolves.toEqual({ ok: false });
    }
  });

  test("removePairedNode reports not-found for special keys instead of a false success", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "remoteclaw-node-pairing-"));
    for (const key of dangerousKeys) {
      await expect(removePairedNode(key, baseDir)).resolves.toBeNull();
    }
  });

  test("write paths never mutate a prototype through a special key", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "remoteclaw-node-pairing-"));
    for (const key of dangerousKeys) {
      await expect(renamePairedNode(key, "pwned", baseDir)).resolves.toBeNull();
      await expect(
        updatePairedNodeMetadata(key, { displayName: "pwned" }, baseDir),
      ).resolves.toBeUndefined();
    }
    // Prototype pollution would leak the injected value onto every object.
    expect(({} as Record<string, unknown>).displayName).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty("displayName");
  });

  test("special-key inputs leave a real paired node and persisted state intact", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "remoteclaw-node-pairing-"));
    await setupPairedNode(baseDir);

    for (const key of dangerousKeys) {
      await expect(removePairedNode(key, baseDir)).resolves.toBeNull();
      await expect(renamePairedNode(key, "pwned", baseDir)).resolves.toBeNull();
      await expect(
        updatePairedNodeMetadata(key, { displayName: "pwned" }, baseDir),
      ).resolves.toBeUndefined();
    }

    const paired = await getPairedNode("node-1", baseDir);
    expect(paired?.nodeId).toBe("node-1");
    const listed = await listNodePairing(baseDir);
    expect(listed.paired.map((node) => node.nodeId)).toEqual(["node-1"]);
  });

  test("drops dangerous own-keys from a corrupted paired-node state file on load", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "remoteclaw-node-pairing-"));
    const { dir, pairedPath } = resolvePairingPaths(baseDir, "nodes");
    await mkdir(dir, { recursive: true });
    // A corrupted state file carrying special keys as own properties. `__proto__`
    // set via an object literal would mutate the prototype rather than serialize,
    // so build the raw JSON directly — JSON.parse materializes these as own keys.
    const evil = { token: "x", createdAtMs: 0, approvedAtMs: 0 };
    const entries = [
      `"node-1":${JSON.stringify({ nodeId: "node-1", token: "t".repeat(43), createdAtMs: 1, approvedAtMs: 2 })}`,
      `"__proto__":${JSON.stringify({ nodeId: "__proto__", ...evil })}`,
      `"constructor":${JSON.stringify({ nodeId: "constructor", ...evil })}`,
      `"prototype":${JSON.stringify({ nodeId: "prototype", ...evil })}`,
    ];
    await writeFile(pairedPath, `{${entries.join(",")}}`, "utf8");

    // listNodePairing enumerates the map directly (bypassing normalizeNodeId),
    // so it exercises toSafeRecord's own-key sanitization on load.
    const listed = await listNodePairing(baseDir);
    expect(listed.paired.map((node) => node.nodeId)).toEqual(["node-1"]);
    await expect(getPairedNode("__proto__", baseDir)).resolves.toBeNull();
    await expect(getPairedNode("constructor", baseDir)).resolves.toBeNull();
    await expect(getPairedNode("prototype", baseDir)).resolves.toBeNull();
    expect(({} as Record<string, unknown>).nodeId).toBeUndefined();
  });

  test("drops the empty-string own-key from a corrupted paired-node state file on load", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "remoteclaw-node-pairing-"));
    const { dir, pairedPath } = resolvePairingPaths(baseDir, "nodes");
    await mkdir(dir, { recursive: true });
    // A corrupted/hostile state file carrying a literal empty-string own-key.
    // normalizeNodeId maps every blocked id (e.g. "__proto__") to "", so if this
    // "" entry survived load, pairedByNodeId[""] would resolve to it and a
    // blocked-key lookup would return the attacker-planted node and its token.
    // toSafeRecord's `!key` drop closes that: the "" key never lands in the map.
    const entries = [
      `"node-1":${JSON.stringify({ nodeId: "node-1", token: "t".repeat(43), createdAtMs: 1, approvedAtMs: 2 })}`,
      `"":${JSON.stringify({ nodeId: "", token: "planted-empty-key-token", createdAtMs: 0, approvedAtMs: 0 })}`,
    ];
    await writeFile(pairedPath, `{${entries.join(",")}}`, "utf8");

    // The legit node survives; the "" entry is dropped on load.
    const listed = await listNodePairing(baseDir);
    expect(listed.paired.map((node) => node.nodeId)).toEqual(["node-1"]);
    // A blocked-key lookup (normalizes to "") and a literal "" lookup must both
    // miss — no path can resolve to the planted "" entry.
    await expect(getPairedNode("__proto__", baseDir)).resolves.toBeNull();
    await expect(getPairedNode("", baseDir)).resolves.toBeNull();
  });

  test("loads pairing maps as null-prototype objects (positional invariant tripwire)", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "remoteclaw-node-pairing-"));
    const state = await loadNodePairingStateForTest(baseDir);
    // The un-normalized index sites (approve/reject by requestId, approve by
    // pending.nodeId) are safe partly because these maps carry no prototype. If a
    // future refactor restores a plain `{}`, this trips before the hole reopens.
    expect(Object.getPrototypeOf(state.pairedByNodeId)).toBeNull();
    expect(Object.getPrototypeOf(state.pendingById)).toBeNull();
  });

  test("approve and reject treat special-key request ids as not-found", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "remoteclaw-node-pairing-"));
    for (const key of dangerousKeys) {
      await expect(
        approveNodePairing(key, { callerScopes: ["operator.pairing", "operator.admin"] }, baseDir),
      ).resolves.toBeNull();
      await expect(rejectNodePairing(key, baseDir)).resolves.toBeNull();
    }
    // A raw special-key index of the store would have leaked a value onto every
    // object; nothing must persist to the prototype.
    expect(Object.prototype).not.toHaveProperty("token");
  });

  test("approve refuses a corrupted pending entry whose nodeId is a special key", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "remoteclaw-node-pairing-"));
    const { dir, pendingPath } = resolvePairingPaths(baseDir, "nodes");
    await mkdir(dir, { recursive: true });
    // A corrupted pending map keyed by a benign requestId but carrying a special
    // key as its nodeId. Approving it must not write pairedByNodeId["__proto__"]
    // nor pollute the prototype; the local normalizeNodeId guard reads it as
    // not-found instead. Keep ts fresh so the entry survives load-time pruning.
    const ts = Date.now();
    for (const key of dangerousKeys) {
      const requestId = `req-${key}`;
      await writeFile(
        pendingPath,
        JSON.stringify({ [requestId]: { requestId, nodeId: key, ts } }),
        "utf8",
      );
      await expect(
        approveNodePairing(
          requestId,
          { callerScopes: ["operator.pairing", "operator.admin"] },
          baseDir,
        ),
      ).resolves.toBeNull();
    }
    expect(({} as Record<string, unknown>).token).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty("token");
  });

  test("drops dangerous own-keys from a corrupted pending state file on load", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "remoteclaw-node-pairing-"));
    const { dir, pendingPath } = resolvePairingPaths(baseDir, "nodes");
    await mkdir(dir, { recursive: true });
    // Keep the legit entry within the pending TTL so load-time pruning retains it.
    const ts = Date.now();
    const evil = (key: string) => JSON.stringify({ requestId: key, nodeId: key, ts });
    const entries = [
      `"req-1":${JSON.stringify({ requestId: "req-1", nodeId: "node-1", ts })}`,
      `"__proto__":${evil("__proto__")}`,
      `"constructor":${evil("constructor")}`,
      `"prototype":${evil("prototype")}`,
    ];
    await writeFile(pendingPath, `{${entries.join(",")}}`, "utf8");

    // listNodePairing enumerates pendingById directly, exercising toSafeRecord's
    // own-key sanitization on load.
    const listed = await listNodePairing(baseDir);
    expect(listed.pending.map((req) => req.requestId)).toEqual(["req-1"]);
    expect(({} as Record<string, unknown>).nodeId).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty("nodeId");
  });

  test("node ids that merely contain a special key are still handled normally", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "remoteclaw-node-pairing-"));
    const nearMissId = "__proto__-device";
    const request = await requestNodePairing({ nodeId: nearMissId, platform: "darwin" }, baseDir);
    await approveNodePairing(
      request.request.requestId,
      { callerScopes: ["operator.pairing"] },
      baseDir,
    );

    const paired = await getPairedNode(nearMissId, baseDir);
    expect(paired?.nodeId).toBe(nearMissId);
    await expect(renamePairedNode(nearMissId, "Renamed", baseDir)).resolves.toEqual(
      expect.objectContaining({ nodeId: nearMissId, displayName: "Renamed" }),
    );
    await expect(removePairedNode(nearMissId, baseDir)).resolves.toEqual(
      expect.objectContaining({ nodeId: nearMissId }),
    );
    await expect(getPairedNode(nearMissId, baseDir)).resolves.toBeNull();
  });
});
