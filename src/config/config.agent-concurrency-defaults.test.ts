import { describe, expect, it } from "vitest";
import {
  DEFAULT_AGENT_MAX_CONCURRENT,
  DEFAULT_SUBAGENT_MAX_CONCURRENT,
  resolveAgentMaxConcurrent,
  resolveSubagentMaxConcurrent,
} from "./agent-limits.js";
import { loadConfig } from "./config.js";
import { withTempHome, writeRemoteClawConfig } from "./test-helpers.js";
import { RemoteClawSchema } from "./zod-schema.js";

describe("agent concurrency defaults", () => {
  it("resolves defaults when unset", () => {
    expect(resolveAgentMaxConcurrent({})).toBe(DEFAULT_AGENT_MAX_CONCURRENT);
    expect(resolveSubagentMaxConcurrent({})).toBe(DEFAULT_SUBAGENT_MAX_CONCURRENT);
  });

  it("clamps invalid values to at least 1", () => {
    const cfg = {
      agents: {
        defaults: {
          maxConcurrent: 0,
          subagents: { maxConcurrent: -3 },
        },
      },
    };
    expect(resolveAgentMaxConcurrent(cfg)).toBe(1);
    expect(resolveSubagentMaxConcurrent(cfg)).toBe(1);
  });

  it("accepts subagent spawn depth and per-agent child limits", () => {
    const parsed = RemoteClawSchema.parse({
      agents: {
        list: [{ id: "main", workspace: "/tmp/main" }],
        defaults: {
          subagents: {
            maxSpawnDepth: 2,
            maxChildrenPerAgent: 7,
          },
        },
      },
    });

    expect(parsed.agents?.defaults?.subagents?.maxSpawnDepth).toBe(2);
    expect(parsed.agents?.defaults?.subagents?.maxChildrenPerAgent).toBe(7);
  });

  it("resolves defaults for configs with no agents declared", async () => {
    await withTempHome(async (home) => {
      await writeRemoteClawConfig(home, {});

      const cfg = loadConfig();

      // With agents.list required, empty configs do not auto-inject agents.defaults;
      // runtime resolvers still fall back to the same constants.
      expect(resolveAgentMaxConcurrent(cfg)).toBe(DEFAULT_AGENT_MAX_CONCURRENT);
      expect(resolveSubagentMaxConcurrent(cfg)).toBe(DEFAULT_SUBAGENT_MAX_CONCURRENT);
    });
  });

  it("injects defaults on load when agents are declared", async () => {
    await withTempHome(async (home) => {
      await writeRemoteClawConfig(home, {
        agents: { list: [{ id: "main", workspace: "/tmp/main" }] },
      });

      const cfg = loadConfig();

      expect(cfg.agents?.defaults?.maxConcurrent).toBe(DEFAULT_AGENT_MAX_CONCURRENT);
      expect(cfg.agents?.defaults?.subagents?.maxConcurrent).toBe(DEFAULT_SUBAGENT_MAX_CONCURRENT);
    });
  });
});
