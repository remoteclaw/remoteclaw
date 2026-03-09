import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isTruthyEnvValue } from "../../infra/env.js";
import { ChannelBridge } from "../channel-bridge.js";
import { SessionMap } from "../session-map.js";
import type { ChannelMessage } from "../types.js";
import { TEST_IMAGE_PATH } from "./test-image.js";

const LIVE = isTruthyEnvValue(process.env.LIVE);

describe.skipIf(!LIVE)("codex CLI middleware smoke test", () => {
  let bridge: ChannelBridge;
  let tempDir: string;
  let lastSessionId: string | undefined;

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

    // Codex CLI requires a trusted git directory
    execFileSync("git", ["init"], { cwd: tempDir, stdio: "ignore" });

    // Write a no-op MCP server script so the ChannelBridge MCP config points to a valid file
    const noopMcpServer = join(tempDir, "noop-mcp-server.js");
    await writeFile(noopMcpServer, "// no-op MCP server for smoke test\n");

    const sessionMap = new SessionMap(tempDir);
    bridge = new ChannelBridge({
      provider: "codex",
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

    lastSessionId = result.run.sessionId;
  }, 60_000);

  it("processes an image attachment and describes the content", async () => {
    const msg = makeMessage("What color is this image? Reply with just the color name.");
    msg.mediaUrls = [TEST_IMAGE_PATH];

    const result = await bridge.handle(msg);

    // Image delivery forces a new session (Codex resume subcommand does not
    // support --image), so update lastSessionId before content assertions
    // to keep the resume test aligned even if this assertion is flaky.
    if (result.run.sessionId) {
      lastSessionId = result.run.sessionId;
    }

    expect(result.payloads.length).toBeGreaterThan(0);
    expect(result.run.text).toBeTruthy();
    expect(result.run.text.toLowerCase()).toContain("red");
    expect(result.run.aborted).toBe(false);
    expect(result.run.sessionId).toBeTruthy();
    // Longer timeout: Codex may use tool calls (e.g. Python/PIL) to analyze
    // the image, which takes significantly longer than direct multimodal input.
  }, 120_000);

  it("resumes the session on a follow-up message", async () => {
    expect(lastSessionId).toBeTruthy();

    const result = await bridge.handle(
      makeMessage("What was the number I just asked about? Reply with just the number."),
    );

    expect(result.payloads.length).toBeGreaterThan(0);
    expect(result.run.text).toBeTruthy();
    expect(result.run.sessionId).toBe(lastSessionId);
    expect(result.run.aborted).toBe(false);
  }, 60_000);
});
