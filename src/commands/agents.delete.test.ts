import fs from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadSessionStore, resolveStorePath, saveSessionStore } from "../config/sessions.js";
import type { RemoteClawConfig } from "../config/types.remoteclaw.js";
import { withStateDirEnv } from "../test-helpers/state-dir-env.js";
import { baseConfigSnapshot, createTestRuntime } from "./test-runtime-config-helpers.js";

const configMocks = vi.hoisted(() => ({
  readConfigFileSnapshot: vi.fn(),
  replaceConfigFile: vi.fn(async () => {}),
}));

const processMocks = vi.hoisted(() => ({
  runCommandWithTimeout: vi.fn(async () => ({ stdout: "", stderr: "", code: 0 })),
}));

vi.mock("../config/config.js", async () => ({
  ...(await vi.importActual<typeof import("../config/config.js")>("../config/config.js")),
  readConfigFileSnapshot: configMocks.readConfigFileSnapshot,
  replaceConfigFile: configMocks.replaceConfigFile,
}));

vi.mock("../process/exec.js", () => ({
  runCommandWithTimeout: processMocks.runCommandWithTimeout,
}));

import { agentsDeleteCommand } from "./agents.js";

const runtime = createTestRuntime();

async function arrangeAgentsDeleteTest(params: {
  stateDir: string;
  cfg: RemoteClawConfig;
  deletedAgentId?: string;
  sessions: Record<string, { sessionId: string; updatedAt: number }>;
}) {
  const deletedAgentId = params.deletedAgentId ?? "ops";
  const storePath = resolveStorePath(params.cfg.session?.store, { agentId: deletedAgentId });
  await saveSessionStore(storePath, params.sessions);
  await fs.mkdir(path.join(params.stateDir, `workspace-${deletedAgentId}`), { recursive: true });
  await fs.mkdir(path.join(params.stateDir, "agents", deletedAgentId, "agent"), {
    recursive: true,
  });

  configMocks.readConfigFileSnapshot.mockResolvedValue({
    ...baseConfigSnapshot,
    config: params.cfg,
    runtimeConfig: params.cfg,
    sourceConfig: params.cfg,
    resolved: params.cfg,
  });

  return storePath;
}

function expectSessionStore(
  storePath: string,
  sessions: Record<string, { sessionId: string; updatedAt: number }>,
) {
  expect(loadSessionStore(storePath, { skipCache: true })).toEqual(sessions);
}

function readJsonLogs(): Array<Record<string, unknown>> {
  return runtime.log.mock.calls
    .filter((call): call is [string, ...unknown[]] => {
      const arg = call[0];
      return typeof arg === "string" && arg.startsWith("{");
    })
    .map((call) => JSON.parse(call[0]) as Record<string, unknown>);
}

describe("agents delete command", () => {
  beforeEach(() => {
    configMocks.readConfigFileSnapshot.mockReset();
    configMocks.replaceConfigFile.mockReset();
    processMocks.runCommandWithTimeout.mockClear();
    runtime.log.mockClear();
    runtime.error.mockClear();
    runtime.exit.mockClear();
  });

  it("purges deleted agent entries from the session store", async () => {
    await withStateDirEnv("remoteclaw-agents-delete-", async ({ stateDir }) => {
      const now = Date.now();
      const cfg: RemoteClawConfig = {
        agents: {
          list: [
            { id: "main", workspace: path.join(stateDir, "workspace-main") },
            { id: "ops", workspace: path.join(stateDir, "workspace-ops") },
          ],
        },
      } satisfies RemoteClawConfig;
      const storePath = await arrangeAgentsDeleteTest({
        stateDir,
        cfg,
        sessions: {
          "agent:ops:main": { sessionId: "sess-ops-main", updatedAt: now + 1 },
          "agent:ops:quietchat:direct:u1": { sessionId: "sess-ops-direct", updatedAt: now + 2 },
          "agent:main:main": { sessionId: "sess-main", updatedAt: now + 3 },
        },
      });

      await agentsDeleteCommand({ id: "ops", force: true, json: true }, runtime);

      expect(runtime.exit).not.toHaveBeenCalled();
      expect(configMocks.replaceConfigFile).toHaveBeenCalledWith(
        expect.objectContaining({
          nextConfig: {
            agents: { list: [{ id: "main", workspace: path.join(stateDir, "workspace-main") }] },
          },
        }),
      );
      expectSessionStore(storePath, {
        "agent:main:main": { sessionId: "sess-main", updatedAt: now + 3 },
      });
    });
  });

  it("purges legacy main-alias entries owned by the deleted default agent", async () => {
    await withStateDirEnv("remoteclaw-agents-delete-main-alias-", async ({ stateDir }) => {
      const now = Date.now();
      const cfg: RemoteClawConfig = {
        agents: {
          list: [{ id: "ops", default: true, workspace: path.join(stateDir, "workspace-ops") }],
        },
      };
      const storePath = await arrangeAgentsDeleteTest({
        stateDir,
        cfg,
        sessions: {
          "agent:main:main": { sessionId: "sess-default-alias", updatedAt: now + 1 },
          "agent:ops:quietchat:direct:u1": { sessionId: "sess-ops-direct", updatedAt: now + 2 },
          "agent:main:quietchat:direct:u2": {
            sessionId: "sess-stale-main",
            updatedAt: now + 3,
          },
          global: { sessionId: "sess-global", updatedAt: now + 4 },
        },
      });

      await agentsDeleteCommand({ id: "ops", force: true, json: true }, runtime);

      expect(runtime.exit).not.toHaveBeenCalled();
      expectSessionStore(storePath, {
        "agent:main:quietchat:direct:u2": {
          sessionId: "sess-stale-main",
          updatedAt: now + 3,
        },
        global: { sessionId: "sess-global", updatedAt: now + 4 },
      });
    });
  });

  it("preserves shared-store legacy default keys when deleting another agent", async () => {
    await withStateDirEnv("remoteclaw-agents-delete-shared-store-", async ({ stateDir }) => {
      const now = Date.now();
      const cfg: RemoteClawConfig = {
        session: { store: path.join(stateDir, "sessions.json") },
        agents: {
          list: [
            { id: "main", default: true, workspace: path.join(stateDir, "workspace-main") },
            { id: "ops", workspace: path.join(stateDir, "workspace-ops") },
          ],
        },
      };
      const storePath = await arrangeAgentsDeleteTest({
        stateDir,
        cfg,
        sessions: {
          main: { sessionId: "sess-main", updatedAt: now + 1 },
          "quietchat:direct:u1": { sessionId: "sess-main-direct", updatedAt: now + 2 },
          "agent:ops:main": { sessionId: "sess-ops-main", updatedAt: now + 3 },
          "agent:ops:quietchat:direct:u2": { sessionId: "sess-ops-direct", updatedAt: now + 4 },
        },
      });

      await agentsDeleteCommand({ id: "ops", force: true, json: true }, runtime);

      expect(runtime.exit).not.toHaveBeenCalled();
      expectSessionStore(storePath, {
        main: { sessionId: "sess-main", updatedAt: now + 1 },
        "quietchat:direct:u1": { sessionId: "sess-main-direct", updatedAt: now + 2 },
      });
    });
  });

  it("never trashes the user-owned workspace, even when no other agent shares it (#587)", async () => {
    await withStateDirEnv("remoteclaw-agents-delete-preserve-workspace-", async ({ stateDir }) => {
      const opsWorkspace = path.join(stateDir, "workspace-ops");
      const mainWorkspace = path.join(stateDir, "workspace-main");
      await fs.mkdir(opsWorkspace, { recursive: true });
      await fs.mkdir(mainWorkspace, { recursive: true });

      const now = Date.now();
      const cfg: RemoteClawConfig = {
        agents: {
          list: [
            { id: "main", workspace: mainWorkspace },
            { id: "ops", workspace: opsWorkspace },
          ],
        },
      } satisfies RemoteClawConfig;
      await arrangeAgentsDeleteTest({
        stateDir,
        cfg,
        deletedAgentId: "ops",
        sessions: {
          "agent:ops:main": { sessionId: "sess-ops-main", updatedAt: now + 1 },
          "agent:main:main": { sessionId: "sess-main", updatedAt: now + 2 },
        },
      });

      await agentsDeleteCommand({ id: "ops", force: true, json: true }, runtime);

      // The workspace is user-owned — never trash it, even though "ops" is the
      // only agent using it (the pre-#587 behavior trashed the unique workspace).
      expect(processMocks.runCommandWithTimeout).not.toHaveBeenCalledWith(["trash", opsWorkspace], {
        timeoutMs: 5000,
      });

      // JSON output signals the workspace was preserved rather than deleted.
      const jsonOutput = readJsonLogs();
      expect(jsonOutput).toHaveLength(1);
      expect(jsonOutput[0]).toMatchObject({
        workspace: opsWorkspace,
        workspacePreserved: true,
      });
    });
  });

  it("still trashes RemoteClaw-owned state and never the workspace (#587)", async () => {
    await withStateDirEnv("remoteclaw-agents-delete-owned-state-", async ({ stateDir }) => {
      const opsWorkspace = path.join(stateDir, "workspace-ops");
      const mainWorkspace = path.join(stateDir, "workspace-main");
      await fs.mkdir(opsWorkspace, { recursive: true });
      await fs.mkdir(mainWorkspace, { recursive: true });

      const now = Date.now();
      const cfg: RemoteClawConfig = {
        agents: {
          list: [
            { id: "main", workspace: mainWorkspace },
            { id: "ops", workspace: opsWorkspace },
          ],
        },
      } satisfies RemoteClawConfig;
      await arrangeAgentsDeleteTest({
        stateDir,
        cfg,
        deletedAgentId: "ops",
        sessions: {
          "agent:ops:main": { sessionId: "sess-ops-main", updatedAt: now + 1 },
          "agent:main:main": { sessionId: "sess-main", updatedAt: now + 2 },
        },
      });

      await agentsDeleteCommand({ id: "ops", force: true, json: true }, runtime);

      const trashCalls = processMocks.runCommandWithTimeout.mock.calls as unknown as Array<
        [string[], unknown]
      >;
      const trashedPaths = trashCalls
        .map((call) => call[0])
        .filter((argv) => argv[0] === "trash")
        .map((argv) => argv[1]);
      // Delete still cleans up RemoteClaw-owned state (it is not a no-op)...
      expect(trashedPaths.length).toBeGreaterThan(0);
      // ...but the user-owned workspace is never among the trashed paths.
      expect(trashedPaths).not.toContain(opsWorkspace);
    });
  });
});
