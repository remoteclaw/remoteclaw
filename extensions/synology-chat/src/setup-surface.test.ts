import { describe, expect, it, vi } from "vitest";
import { buildChannelSetupWizardAdapterFromSetupWizard } from "../../../src/channels/plugins/setup-wizard.js";
import type { RemoteClawConfig } from "../../../src/config/config.js";
import type { WizardPrompter } from "../../../src/wizard/prompts.js";
import { createRuntimeEnv } from "../../test-utils/runtime-env.js";
import { synologyChatPlugin } from "./channel.js";

function createPrompter(overrides: Partial<WizardPrompter> = {}): WizardPrompter {
  return {
    intro: vi.fn(async () => {}),
    outro: vi.fn(async () => {}),
    note: vi.fn(async () => {}),
    select: vi.fn(async ({ options }: { options: Array<{ value: string }> }) => {
      const first = options[0];
      if (!first) {
        throw new Error("no options");
      }
      return first.value;
    }) as WizardPrompter["select"],
    multiselect: vi.fn(async () => []),
    text: vi.fn(async () => "") as WizardPrompter["text"],
    confirm: vi.fn(async () => false),
    progress: vi.fn(() => ({ update: vi.fn(), stop: vi.fn() })),
    ...overrides,
  };
}

const synologyChatConfigureAdapter = buildChannelSetupWizardAdapterFromSetupWizard({
  plugin: synologyChatPlugin,
  wizard: synologyChatSetupWizard,
});

describe("synology-chat setup wizard", () => {
  it("configures token and incoming webhook for the default account", async () => {
    const prompter = createTestWizardPrompter({
      text: vi.fn(async ({ message }: { message: string }) => {
        if (message === "Enter Synology Chat outgoing webhook token") {
          return "synology-token";
        }
        if (message === "Incoming webhook URL") {
          return "https://nas.example.com/webapi/entry.cgi?token=incoming";
        }
        if (message === "Outgoing webhook path (optional)") {
          return "";
        }
        throw new Error(`Unexpected prompt: ${message}`);
      }) as WizardPrompter["text"],
    });

    const result = await runSetupWizardConfigure({
      configure: synologyChatConfigureAdapter.configure,
      cfg: {} as RemoteClawConfig,
      prompter,
      options: {},
    });

    expect(result.accountId).toBe("default");
    expect(result.cfg.channels?.["synology-chat"]?.enabled).toBe(true);
    expect(result.cfg.channels?.["synology-chat"]?.token).toBe("synology-token");
    expect(result.cfg.channels?.["synology-chat"]?.incomingUrl).toBe(
      "https://nas.example.com/webapi/entry.cgi?token=incoming",
    );
  });

  it("records allowed user ids when setup forces allowFrom", async () => {
    const prompter = createTestWizardPrompter({
      text: vi.fn(async ({ message }: { message: string }) => {
        if (message === "Enter Synology Chat outgoing webhook token") {
          return "synology-token";
        }
        if (message === "Incoming webhook URL") {
          return "https://nas.example.com/webapi/entry.cgi?token=incoming";
        }
        if (message === "Outgoing webhook path (optional)") {
          return "";
        }
        if (message === "Allowed Synology Chat user ids") {
          return "123456, synology-chat:789012";
        }
        throw new Error(`Unexpected prompt: ${message}`);
      }) as WizardPrompter["text"],
    });

    const result = await runSetupWizardConfigure({
      configure: synologyChatConfigureAdapter.configure,
      cfg: {} as RemoteClawConfig,
      prompter,
      options: {},
      forceAllowFrom: true,
    });

    expect(result.cfg.channels?.["synology-chat"]?.dmPolicy).toBe("allowlist");
    expect(result.cfg.channels?.["synology-chat"]?.allowedUserIds).toEqual(["123456", "789012"]);
  });
});
