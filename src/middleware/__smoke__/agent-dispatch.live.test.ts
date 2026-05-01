import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveAgentRuntimeOrThrow } from "../../agents/agent-scope.js";
import type { RemoteClawConfig } from "../../config/config.js";
import { isTruthyEnvValue } from "../../infra/env.js";
import { ChannelBridge } from "../channel-bridge.js";
import { SessionMap } from "../session-map.js";
import type { ChannelMessage } from "../types.js";

const LIVE = isTruthyEnvValue(process.env.LIVE);

/**
 * Regression coverage for #2408-class defects — a broken `resolveAgentRuntimeOrThrow`
 * (e.g., unconditional-throw stub) must fail this test. Every other middleware smoke
 * test hardcodes `provider: "claude"|"codex"|...`; this one derives `provider` via
 * the real resolver, mirroring the production call chain at
 * `src/auto-reply/reply/agent-runner-execution.ts:349-350`,
 * `src/commands/agent.ts:189`, and `src/cron/isolated-agent/run.ts:342,389`.
 */

/** Env vars that Claude Code sets and that cause nesting rejection in `claude -p`. */
const CLAUDE_CODE_ENV_KEYS = [
  "CLAUDECODE",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_CODE_MAX_OUTPUT_TOKENS",
];

describe.skipIf(!LIVE)(
  "agent dispatch live test (resolveAgentRuntimeOrThrow → ChannelBridge)",
  () => {
    let bridge: ChannelBridge;
    let tempDir: string;
    const savedEnv: Record<string, string | undefined> = {};

    const channelId = "agent-dispatch-live";
    const userId = "agent-dispatch-user";
    const agentId = "main";

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

      tempDir = await mkdtemp(join(tmpdir(), "rc-agent-dispatch-live-"));

      // Write a no-op MCP server script so the ChannelBridge MCP config points to a valid file
      const noopMcpServer = join(tempDir, "noop-mcp-server.js");
      await writeFile(noopMcpServer, "// no-op MCP server for agent dispatch live test\n");

      // Mirror the production call chain: resolver → ChannelBridge, not hardcoded string.
      const cfg: RemoteClawConfig = {
        agents: {
          list: [{ id: agentId }],
          defaults: { runtime: "claude" },
        },
      };
      const provider = resolveAgentRuntimeOrThrow(cfg, agentId);

      const sessionMap = new SessionMap(tempDir);
      bridge = new ChannelBridge({
        provider,
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

    it("resolves runtime and dispatches through ChannelBridge to a real CLI", async () => {
      const result = await bridge.handle(makeMessage("What is 2+2? Reply with just the number."));

      expect(result.payloads.length).toBeGreaterThan(0);
      expect(result.run.text).toBeTruthy();
      expect(result.run.text).toContain("4");
      expect(result.run.sessionId).toBeTruthy();
      expect(result.run.aborted).toBe(false);
      expect(result.run.durationMs).toBeGreaterThan(0);
      expect(result.error).toBeUndefined();
    }, 60_000);
  },
);
