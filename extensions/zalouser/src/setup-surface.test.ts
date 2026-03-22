import type { RemoteClawConfig } from "remoteclaw/plugin-sdk/zalouser";
import { describe, expect, it, vi } from "vitest";
import {
  createPluginSetupWizardConfigure,
  createTestWizardPrompter,
  runSetupWizardConfigure,
} from "../../../test/helpers/extensions/setup-wizard.js";
import type { RemoteClawConfig } from "../runtime-api.js";
import "./zalo-js.test-mocks.js";
import { zalouserPlugin } from "./channel.js";

const zalouserConfigure = createPluginSetupWizardConfigure(zalouserPlugin);

async function runSetup(params: {
  cfg?: RemoteClawConfig;
  prompter: ReturnType<typeof createTestWizardPrompter>;
  options?: Record<string, unknown>;
  forceAllowFrom?: boolean;
}) {
  return await runSetupWizardConfigure({
    configure: zalouserConfigure,
    cfg: params.cfg as RemoteClawConfig | undefined,
    prompter: params.prompter,
    options: params.options,
    forceAllowFrom: params.forceAllowFrom,
  });
}

describe("zalouser setup wizard", () => {
  it("enables the account without forcing QR login", async () => {
    const runtime = createRuntimeEnv();
    const prompter = createTestWizardPrompter({
      confirm: vi.fn(async ({ message }: { message: string }) => {
        if (message === "Login via QR code now?") {
          return false;
        }
        if (message === "Configure Zalo groups access?") {
          return false;
        }
        return false;
      }),
    });

    const result = await zalouserConfigureAdapter.configure({
      cfg: {} as RemoteClawConfig,
      runtime,
      prompter,
      options: {},
      accountOverrides: {},
      shouldPromptAccountIds: false,
      forceAllowFrom: false,
    });

    expect(result.accountId).toBe("default");
    expect(result.cfg.channels?.zalouser?.enabled).toBe(true);
  });
});
