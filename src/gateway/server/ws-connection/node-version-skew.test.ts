import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  isReleasedVersion,
  resolveLocalNodeId,
  shouldCloseNodeForVersionSkew,
} from "./node-version-skew.js";

describe("isReleasedVersion", () => {
  test("accepts calendar release versions", () => {
    expect(isReleasedVersion("2026.5.27")).toBe(true);
    expect(isReleasedVersion("2026.5.27-beta.1")).toBe(true);
    expect(isReleasedVersion("2026.12.0")).toBe(true);
    expect(isReleasedVersion("2026.5.27+build.9")).toBe(true);
  });

  test("rejects dev / prerelease / non-calendar versions", () => {
    expect(isReleasedVersion("dev")).toBe(false);
    expect(isReleasedVersion("0.0.0")).toBe(false);
    expect(isReleasedVersion("0.2.0")).toBe(false);
    expect(isReleasedVersion("1.2.3")).toBe(false);
    expect(isReleasedVersion("")).toBe(false);
    expect(isReleasedVersion("v2026.5.27")).toBe(false);
    expect(isReleasedVersion("202.5.27")).toBe(false); // 3-digit year
    expect(isReleasedVersion("2026.5")).toBe(false); // missing patch
  });
});

describe("shouldCloseNodeForVersionSkew", () => {
  const base = {
    localNodeId: "node-abc",
    clientInstanceId: "node-abc",
    clientVersion: "2026.5.20",
    gatewayVersion: "2026.5.27",
  };

  test("closes when same-install local node runs a different released version", () => {
    expect(shouldCloseNodeForVersionSkew(base)).toBe(true);
  });

  test("trims the client instanceId before matching the local node id", () => {
    expect(shouldCloseNodeForVersionSkew({ ...base, clientInstanceId: "  node-abc  " })).toBe(true);
  });

  test("exempt: no local node id resolved (no co-located node host)", () => {
    expect(shouldCloseNodeForVersionSkew({ ...base, localNodeId: null })).toBe(false);
  });

  test("exempt: instanceId does not match local node id (remote / SSH-tunneled node)", () => {
    expect(shouldCloseNodeForVersionSkew({ ...base, clientInstanceId: "node-other" })).toBe(false);
  });

  test("exempt: client instanceId missing or blank", () => {
    expect(shouldCloseNodeForVersionSkew({ ...base, clientInstanceId: undefined })).toBe(false);
    expect(shouldCloseNodeForVersionSkew({ ...base, clientInstanceId: "   " })).toBe(false);
  });

  test("exempt: versions are equal", () => {
    expect(shouldCloseNodeForVersionSkew({ ...base, clientVersion: "2026.5.27" })).toBe(false);
  });

  test("exempt: a version is missing", () => {
    expect(shouldCloseNodeForVersionSkew({ ...base, clientVersion: undefined })).toBe(false);
    expect(shouldCloseNodeForVersionSkew({ ...base, gatewayVersion: undefined })).toBe(false);
    expect(shouldCloseNodeForVersionSkew({ ...base, clientVersion: "" })).toBe(false);
  });

  test("exempt: client version is not a release (dev node vs released gateway)", () => {
    expect(shouldCloseNodeForVersionSkew({ ...base, clientVersion: "dev" })).toBe(false);
  });

  test("exempt: gateway version is not a release (dev gateway never kicks a node)", () => {
    expect(shouldCloseNodeForVersionSkew({ ...base, gatewayVersion: "dev" })).toBe(false);
  });
});

describe("resolveLocalNodeId", () => {
  const priorStateDir = process.env.REMOTECLAW_STATE_DIR;
  const created: string[] = [];

  afterEach(async () => {
    if (priorStateDir === undefined) {
      delete process.env.REMOTECLAW_STATE_DIR;
    } else {
      process.env.REMOTECLAW_STATE_DIR = priorStateDir;
    }
    await Promise.all(created.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  async function withStateDir(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rc-node-skew-"));
    created.push(dir);
    process.env.REMOTECLAW_STATE_DIR = dir;
    return dir;
  }

  test("returns the trimmed nodeId from node.json", async () => {
    const dir = await withStateDir();
    await fs.writeFile(
      path.join(dir, "node.json"),
      JSON.stringify({ version: 1, nodeId: "  node-xyz  " }),
    );
    expect(await resolveLocalNodeId()).toBe("node-xyz");
  });

  test("returns null when node.json is absent", async () => {
    await withStateDir();
    expect(await resolveLocalNodeId()).toBeNull();
  });

  test("returns null when nodeId is empty or missing", async () => {
    const dir = await withStateDir();
    await fs.writeFile(path.join(dir, "node.json"), JSON.stringify({ version: 1, nodeId: "   " }));
    expect(await resolveLocalNodeId()).toBeNull();
    await fs.writeFile(path.join(dir, "node.json"), JSON.stringify({ version: 1 }));
    expect(await resolveLocalNodeId()).toBeNull();
  });

  test("returns null when node.json is malformed", async () => {
    const dir = await withStateDir();
    await fs.writeFile(path.join(dir, "node.json"), "not json{");
    expect(await resolveLocalNodeId()).toBeNull();
  });
});
