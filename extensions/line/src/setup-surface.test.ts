import type { RemoteClawConfig } from "remoteclaw/plugin-sdk/line";
import { describe, expect, it, vi } from "vitest";
import { buildChannelSetupWizardAdapterFromSetupWizard } from "../../../src/channels/plugins/setup-wizard.js";
import {
  listLineAccountIds,
  resolveDefaultLineAccountId,
  resolveLineAccount,
} from "../../../src/line/accounts.js";
import {
  createPluginSetupWizardConfigure,
  createTestWizardPrompter,
  runSetupWizardConfigure,
  type WizardPrompter,
} from "../../../test/helpers/extensions/setup-wizard.js";
import type { RemoteClawConfig } from "../api.js";
import { linePlugin } from "./channel.js";

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

const lineConfigureAdapter = buildChannelSetupWizardAdapterFromSetupWizard({
  plugin: {
    id: "line",
    meta: { label: "LINE" },
    config: {
      listAccountIds: listLineAccountIds,
      defaultAccountId: resolveDefaultLineAccountId,
      resolveAllowFrom: ({ cfg, accountId }: { cfg: RemoteClawConfig; accountId?: string | null }) =>
        resolveLineAccount({ cfg, accountId: accountId ?? undefined }).config.allowFrom,
    },
    setup: lineSetupAdapter,
  } as Parameters<typeof buildChannelSetupWizardAdapterFromSetupWizard>[0]["plugin"],
  wizard: lineSetupWizard,
});

describe("line setup wizard", () => {
  it("configures token and secret for the default account", async () => {
    const prompter = createTestWizardPrompter({
      text: vi.fn(async ({ message }: { message: string }) => {
        if (message === "Enter LINE channel access token") {
          return "line-token";
        }
        if (message === "Enter LINE channel secret") {
          return "line-secret";
        }
        throw new Error(`Unexpected prompt: ${message}`);
      }) as WizardPrompter["text"],
    });

    const result = await runSetupWizardConfigure({
      configure: lineConfigureAdapter.configure,
      cfg: {} as RemoteClawConfig,
      prompter,
      options: {},
    });

    expect(result.accountId).toBe("default");
    expect(result.cfg.channels?.line?.enabled).toBe(true);
    expect(result.cfg.channels?.line?.channelAccessToken).toBe("line-token");
    expect(result.cfg.channels?.line?.channelSecret).toBe("line-secret");
  });
});
