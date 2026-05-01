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

/** Env vars that Claude Code sets and that cause nesting rejection in `claude -p`. */
const CLAUDE_CODE_ENV_KEYS = [
  "CLAUDECODE",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_CODE_MAX_OUTPUT_TOKENS",
];

describe.skipIf(!LIVE)("M2 integration live test (claude -p)", () => {
  let bridge: ChannelBridge;
  let tempDir: string;
  const savedEnv: Record<string, string | undefined> = {};
  let firstSessionId: string | undefined;

  const channelId = "integ-live";
  const userId = "integ-user";

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
    for (const key of CLAUDE_CODE_ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }

    tempDir = await mkdtemp(join(tmpdir(), "rc-integ-live-"));

    // Write a no-op MCP server script so the ChannelBridge MCP config points to a valid file
    const noopMcpServer = join(tempDir, "noop-mcp-server.js");
    await writeFile(noopMcpServer, "// no-op MCP server for integration live test\n");

    const sessionMap = new SessionMap(tempDir);
    bridge = new ChannelBridge({
      provider: "claude",
      sessionMap,
      gatewayUrl: "",
      gatewayToken: "",
      workspaceDir: tempDir,
      mcpServerPath: noopMcpServer,
    });
  });

  afterAll(async () => {
    for (const key of CLAUDE_CODE_ENV_KEYS) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }

    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("single-turn: sends message and receives coherent response containing '4'", async () => {
    const result = await bridge.handle(makeMessage("What is 2+2? Reply with just the number."));

    expect(result.payloads.length).toBeGreaterThan(0);
    expect(result.run.text).toBeTruthy();
    expect(result.run.text).toContain("4");
    expect(result.run.sessionId).toBeTruthy();
    expect(result.run.aborted).toBe(false);
    expect(result.run.durationMs).toBeGreaterThan(0);
    expect(result.error).toBeUndefined();

    firstSessionId = result.run.sessionId;
  }, 60_000);

  it("session resumption: follow-up reuses sessionId and recalls context", async () => {
    expect(firstSessionId).toBeTruthy();

    const result = await bridge.handle(
      makeMessage("What was the number I just asked about? Reply with just the number."),
    );

    expect(result.payloads.length).toBeGreaterThan(0);
    expect(result.run.text).toBeTruthy();
    expect(result.run.text).toContain("4");
    expect(result.run.sessionId).toBe(firstSessionId);
    expect(result.run.aborted).toBe(false);
    expect(result.error).toBeUndefined();
  }, 60_000);
});
