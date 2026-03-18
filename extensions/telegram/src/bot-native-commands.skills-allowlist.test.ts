import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { writeSkill } from "../../../src/agents/skills.e2e-test-helpers.js";
import type { RemoteClawConfig } from "../../../src/config/config.js";
import type { TelegramAccountConfig } from "../../../src/config/types.js";
import { registerTelegramNativeCommands } from "./bot-native-commands.js";
import {
  createNativeCommandTestParams,
  listSkillCommandsForAgents,
  resetNativeCommandMenuMocks,
  waitForRegisteredCommands,
} from "./bot-native-commands.menu-test-support.js";

const tempDirs: string[] = [];

async function makeWorkspace(prefix: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe("registerTelegramNativeCommands skill allowlist integration", () => {
  afterEach(async () => {
    pluginCommandMocks.getPluginCommandSpecs.mockClear().mockReturnValue([]);
    pluginCommandMocks.matchPluginCommand.mockClear().mockReturnValue(null);
    pluginCommandMocks.executePluginCommand.mockClear().mockResolvedValue({ text: "ok" });
    deliveryMocks.deliverReplies.mockClear().mockResolvedValue({ delivered: true });
    await Promise.all(
      tempDirs
        .splice(0, tempDirs.length)
        .map((dir) => fs.rm(dir, { recursive: true, force: true })),
    );
  });

  it("registers only allowlisted skills for the bound agent menu", async () => {
    const workspaceDir = await makeWorkspace("openclaw-telegram-skills-");
    await writeSkill({
      dir: path.join(workspaceDir, "skills", "alpha-skill"),
      name: "alpha-skill",
      description: "Alpha skill",
    });
    await writeSkill({
      dir: path.join(workspaceDir, "skills", "beta-skill"),
      name: "beta-skill",
      description: "Beta skill",
    });

    const setMyCommands = vi.fn().mockResolvedValue(undefined);
    const cfg: RemoteClawConfig = {
      agents: {
        list: [
          { id: "alpha", workspace: workspaceDir, skills: ["alpha-skill"] },
          { id: "beta", workspace: workspaceDir, skills: ["beta-skill"] },
        ],
      },
      bindings: [
        {
          agentId: "alpha",
          match: { channel: "telegram", accountId: "bot-a" },
        },
      ],
    };
    const actualSkillCommands = await import("../../../src/auto-reply/skill-commands.js");
    listSkillCommandsForAgents.mockImplementation(({ cfg, agentIds }) =>
      actualSkillCommands.listSkillCommandsForAgents({ cfg, agentIds }),
    );

    registerTelegramNativeCommands({
      bot: {
        api: {
          setMyCommands,
          sendMessage: vi.fn().mockResolvedValue(undefined),
        },
        command: vi.fn(),
      } as unknown as Parameters<typeof registerTelegramNativeCommands>[0]["bot"],
      cfg,
      runtime: { log: vi.fn() } as unknown as Parameters<
        typeof registerTelegramNativeCommands
      >[0]["runtime"],
      accountId: "bot-a",
      telegramCfg: {} as TelegramAccountConfig,
      allowFrom: [],
      groupAllowFrom: [],
      replyToMode: "off",
      textLimit: 4000,
      useAccessGroups: false,
      nativeEnabled: true,
      nativeSkillsEnabled: true,
      nativeDisabledExplicit: false,
      resolveGroupPolicy: () =>
        ({
          allowlistEnabled: false,
          allowed: true,
        }) as ReturnType<
          Parameters<typeof registerTelegramNativeCommands>[0]["resolveGroupPolicy"]
        >,
      resolveTelegramGroupConfig: () => ({
        groupConfig: undefined,
        topicConfig: undefined,
      }),
      shouldSkipUpdate: () => false,
      opts: { token: "token" },
    });

    await vi.waitFor(() => {
      expect(setMyCommands).toHaveBeenCalled();
    });
    const registeredCommands = setMyCommands.mock.calls[0]?.[0] as Array<{
      command: string;
      description: string;
    }>;

    expect(registeredCommands.some((entry) => entry.command === "alpha_skill")).toBe(true);
    expect(registeredCommands.some((entry) => entry.command === "beta_skill")).toBe(false);
  });
});
