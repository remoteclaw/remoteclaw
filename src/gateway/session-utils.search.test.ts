import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { resetSubagentRegistryForTests } from "../agents/subagent-registry.js";
import type { RemoteClawConfig } from "../config/config.js";
import type { SessionEntry } from "../config/sessions.js";
import { listSessionsFromStore } from "./session-utils.js";

function createModelDefaultsConfig(params: {
  primary: string;
  models?: Record<string, Record<string, never>>;
}): RemoteClawConfig {
  return {
    agents: {
      defaults: {
        model: { primary: params.primary },
        models: params.models,
      },
    },
  } as RemoteClawConfig;
}

function createLegacyRuntimeListConfig(
  models?: Record<string, Record<string, never>>,
): RemoteClawConfig {
  return createModelDefaultsConfig({
    primary: "google-gemini-cli/gemini-3-pro-preview",
    ...(models ? { models } : {}),
  });
}

function createLegacyRuntimeStore(model: string): Record<string, SessionEntry> {
  return {
    "agent:main:main": {
      sessionId: "sess-main",
      updatedAt: Date.now(),
      model,
    } as SessionEntry,
  };
}

function withTranscriptStoreFixture<T>(params: {
  prefix: string;
  transcriptId: string;
  provider: string;
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  costTotal: number;
  run: (fixture: { storePath: string; now: number }) => T;
}): T {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), params.prefix));
  const storePath = path.join(tmpDir, "sessions.json");
  const now = Date.now();
  fs.writeFileSync(
    path.join(tmpDir, `${params.transcriptId}.jsonl`),
    [
      JSON.stringify({ type: "session", version: 1, id: params.transcriptId }),
      JSON.stringify({
        message: {
          role: "assistant",
          provider: params.provider,
          model: params.model,
          usage: {
            input: params.input,
            output: params.output,
            cacheRead: params.cacheRead,
            cost: { total: params.costTotal },
          },
        },
      }),
    ].join("\n"),
    "utf-8",
  );

  try {
    return params.run({ storePath, now });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function listSingleSession(params: {
  cfg: RemoteClawConfig;
  storePath: string;
  key: string;
  entry: SessionEntry;
}) {
  return listSessionsFromStore({
    cfg: params.cfg,
    storePath: params.storePath,
    store: {
      [params.key]: params.entry,
    },
    opts: {},
  });
}

describe("listSessionsFromStore search", () => {
  afterEach(() => {
    resetSubagentRegistryForTests({ persist: false });
  });

  const baseCfg = {
    session: { mainKey: "main" },
    agents: { list: [{ id: "main", default: true }] },
  } as RemoteClawConfig;

  const makeStore = (): Record<string, SessionEntry> => ({
    "agent:main:work-project": {
      sessionId: "sess-work-1",
      updatedAt: Date.now(),
      displayName: "Work Project Alpha",
      label: "work",
    } as SessionEntry,
    "agent:main:personal-chat": {
      sessionId: "sess-personal-1",
      updatedAt: Date.now() - 1000,
      displayName: "Personal Chat",
      subject: "Family Reunion Planning",
    } as SessionEntry,
    "agent:main:discord:group:dev-team": {
      sessionId: "sess-discord-1",
      updatedAt: Date.now() - 2000,
      label: "discord",
      subject: "Dev Team Discussion",
    } as SessionEntry,
  });

  test("returns all sessions when search is empty or missing", () => {
    const cases = [{ opts: { search: "" } }, { opts: {} }] as const;
    for (const testCase of cases) {
      const result = listSessionsFromStore({
        cfg: baseCfg,
        storePath: "/tmp/sessions.json",
        store: makeStore(),
        opts: testCase.opts,
      });
      expect(result.sessions).toHaveLength(3);
    }
  });

  test("filters sessions across display metadata and key fields", () => {
    const cases = [
      { search: "WORK PROJECT", expectedKey: "agent:main:work-project" },
      { search: "reunion", expectedKey: "agent:main:personal-chat" },
      { search: "discord", expectedKey: "agent:main:discord:group:dev-team" },
      { search: "sess-personal", expectedKey: "agent:main:personal-chat" },
      { search: "dev-team", expectedKey: "agent:main:discord:group:dev-team" },
      { search: "alpha", expectedKey: "agent:main:work-project" },
      { search: "  personal  ", expectedKey: "agent:main:personal-chat" },
      { search: "nonexistent-term", expectedKey: undefined },
    ] as const;

    for (const testCase of cases) {
      const result = listSessionsFromStore({
        cfg: baseCfg,
        storePath: "/tmp/sessions.json",
        store: makeStore(),
        opts: { search: testCase.search },
      });
      if (!testCase.expectedKey) {
        expect(result.sessions).toHaveLength(0);
        continue;
      }
      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0].key).toBe(testCase.expectedKey);
    }
  });

  test("hides cron run alias session keys from sessions list", () => {
    const now = Date.now();
    const store: Record<string, SessionEntry> = {
      "agent:main:cron:job-1": {
        sessionId: "run-abc",
        updatedAt: now,
        label: "Cron: job-1",
      } as SessionEntry,
      "agent:main:cron:job-1:run:run-abc": {
        sessionId: "run-abc",
        updatedAt: now,
        label: "Cron: job-1",
      } as SessionEntry,
    };

    const result = listSessionsFromStore({
      cfg: baseCfg,
      storePath: "/tmp/sessions.json",
      store,
      opts: {},
    });

    expect(result.sessions.map((session) => session.key)).toEqual(["agent:main:cron:job-1"]);
  });

  test.each([
    {
      name: "does not guess provider for legacy runtime model without modelProvider",
      cfg: createLegacyRuntimeListConfig(),
      runtimeModel: "claude-sonnet-4-6",
      expectedProvider: undefined,
    },
  ])("$name", ({ cfg, runtimeModel, expectedProvider }) => {
    const result = listSessionsFromStore({
      cfg,
      storePath: "/tmp/sessions.json",
      store: createLegacyRuntimeStore(runtimeModel),
      opts: {},
    });

    expect(result.sessions[0]?.modelProvider).toBe(expectedProvider);
    expect(result.sessions[0]?.model).toBe(runtimeModel);
  });

  test("exposes unknown totals when freshness is stale or missing", () => {
    const now = Date.now();
    const store: Record<string, SessionEntry> = {
      "agent:main:fresh": {
        sessionId: "sess-fresh",
        updatedAt: now,
        totalTokens: 1200,
        totalTokensFresh: true,
      } as SessionEntry,
      "agent:main:stale": {
        sessionId: "sess-stale",
        updatedAt: now - 1000,
        totalTokens: 2200,
        totalTokensFresh: false,
      } as SessionEntry,
      "agent:main:missing": {
        sessionId: "sess-missing",
        updatedAt: now - 2000,
        inputTokens: 100,
        outputTokens: 200,
      } as SessionEntry,
    };

    const result = listSessionsFromStore({
      cfg: baseCfg,
      storePath: "/tmp/sessions.json",
      store,
      opts: {},
    });

    const fresh = result.sessions.find((row) => row.key === "agent:main:fresh");
    const stale = result.sessions.find((row) => row.key === "agent:main:stale");
    const missing = result.sessions.find((row) => row.key === "agent:main:missing");
    expect(fresh?.totalTokens).toBe(1200);
    expect(fresh?.totalTokensFresh).toBe(true);
    expect(stale?.totalTokens).toBeUndefined();
    expect(stale?.totalTokensFresh).toBe(false);
    expect(missing?.totalTokens).toBeUndefined();
    expect(missing?.totalTokensFresh).toBe(false);
  });

  test("does not replace the current runtime model when transcript fallback is only for missing pricing", () => {
    withTranscriptStoreFixture({
      prefix: "remoteclaw-session-utils-pricing-",
      transcriptId: "sess-pricing",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      input: 2_000,
      output: 500,
      cacheRead: 1_200,
      costTotal: 0.007725,
      run: ({ storePath, now }) => {
        const result = listSingleSession({
          cfg: {
            session: { mainKey: "main" },
            agents: {
              list: [{ id: "main", default: true }],
            },
          } as unknown as RemoteClawConfig,
          storePath,
          key: "agent:main:main",
          entry: {
            sessionId: "sess-pricing",
            updatedAt: now,
            modelProvider: "openai",
            model: "gpt-5.4",
            contextTokens: 200_000,
            totalTokens: 3_200,
            totalTokensFresh: true,
            inputTokens: 2_000,
            outputTokens: 500,
            cacheRead: 1_200,
          } as SessionEntry,
        });

        expect(result.sessions[0]).toMatchObject({
          key: "agent:main:main",
          modelProvider: "openai",
          model: "gpt-5.4",
          totalTokens: 3_200,
          totalTokensFresh: true,
          contextTokens: 200_000,
        });
      },
    });
  });
});
