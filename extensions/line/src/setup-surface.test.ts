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

const lineConfigure = createPluginSetupWizardConfigure(linePlugin);

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
