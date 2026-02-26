import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isTruthyEnvValue } from "../../infra/env.js";
import { ChannelBridge } from "../channel-bridge.js";
import { SessionMap } from "../session-map.js";
import type { ChannelMessage } from "../types.js";

const LIVE = isTruthyEnvValue(process.env.LIVE);

describe.skipIf(!LIVE)("opencode CLI middleware smoke test", () => {
  let bridge: ChannelBridge;
  let tempDir: string;
  let firstSessionId: string | undefined;

  const channelId = "smoke-test";
  const userId = "smoke-user";

  function makeMessage(text: string): ChannelMessage {
    return {
      id: randomBytes(4).toString("hex"),
      text,
      from: userId,
      channelId,
      provider: "test",
      timestamp: Date.now(),
    };
  }

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "rc-smoke-"));

    // Write a no-op MCP server script so the ChannelBridge MCP config points to a valid file
    const noopMcpServer = join(tempDir, "noop-mcp-server.js");
    await writeFile(noopMcpServer, "// no-op MCP server for smoke test\n");

    const sessionMap = new SessionMap(tempDir);
    bridge = new ChannelBridge({
      provider: "opencode",
      sessionMap,
      gatewayUrl: "",
      gatewayToken: "",
      workspaceDir: tempDir,
      mcpServerPath: noopMcpServer,
    });
  });

  afterAll(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("receives a coherent single-turn response", async () => {
    const result = await bridge.handle(makeMessage("What is 2+2? Reply with just the number."));

    expect(result.payloads.length).toBeGreaterThan(0);
    expect(result.run.text).toBeTruthy();
    expect(result.run.text).toContain("4");
    expect(result.run.sessionId).toBeTruthy();
    expect(result.run.aborted).toBe(false);
    expect(result.run.durationMs).toBeGreaterThan(0);

    firstSessionId = result.run.sessionId;
  }, 60_000);

  it("resumes the session on a follow-up message", async () => {
    expect(firstSessionId).toBeTruthy();

    const result = await bridge.handle(
      makeMessage("What was the number I just asked about? Reply with just the number."),
    );

    expect(result.payloads.length).toBeGreaterThan(0);
    expect(result.run.text).toBeTruthy();
    expect(result.run.sessionId).toBe(firstSessionId);
    expect(result.run.aborted).toBe(false);
  }, 60_000);
});
