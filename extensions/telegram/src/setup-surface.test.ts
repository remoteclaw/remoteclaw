import { DEFAULT_ACCOUNT_ID } from "remoteclaw/plugin-sdk/setup";
import { describe, expect, it, vi } from "vitest";
import type { RemoteClawConfig } from "../../../src/config/config.js";
import {
  createTestWizardPrompter,
  runSetupWizardFinalize,
  runSetupWizardPrepare,
} from "../../../test/helpers/extensions/setup-wizard.js";
import { telegramSetupWizard } from "./setup-surface.js";

async function runPrepare(cfg: RemoteClawConfig, accountId: string) {
  return await runSetupWizardPrepare({
    prepare: telegramSetupWizard.prepare,
    cfg,
    accountId,
    options: {},
  });
}

async function runFinalize(cfg: RemoteClawConfig, accountId: string) {
  const note = vi.fn(async () => undefined);

  await runSetupWizardFinalize({
    finalize: telegramSetupWizard.finalize,
    cfg,
    accountId,
    prompter: createTestWizardPrompter({ note }),
  });

  return note;
}

describe("telegramSetupWizard.prepare", () => {
  it('adds groups["*"].requireMention=true for fresh setups', async () => {
    const prepared = await runPrepare(
      {
        channels: {
          telegram: {
            botToken: "tok",
          },
        },
      },
      DEFAULT_ACCOUNT_ID,
    );

    expect(prepared?.cfg.channels?.telegram?.groups).toEqual({
      "*": { requireMention: true },
    });
  });

  it("preserves an explicit wildcard group mention setting", async () => {
    const prepared = await runPrepare(
      {
        channels: {
          telegram: {
            botToken: "tok",
            groups: {
              "*": { requireMention: false },
            },
          },
        },
      },
      DEFAULT_ACCOUNT_ID,
    );

    expect(prepared?.cfg.channels?.telegram?.groups).toEqual({
      "*": { requireMention: false },
    });
  });
});

describe("telegramSetupWizard.finalize", () => {
  it("shows global config commands for the default account", async () => {
    const note = await runFinalize(
      {
        channels: {
          telegram: {
            botToken: "tok",
          },
        },
      },
      DEFAULT_ACCOUNT_ID,
    );

    expect(note).toHaveBeenCalledWith(
      expect.stringContaining('openclaw config set channels.telegram.dmPolicy "allowlist"'),
      "Telegram DM access warning",
    );
    expect(note).toHaveBeenCalledWith(
      expect.stringContaining(`openclaw config set channels.telegram.allowFrom '["YOUR_USER_ID"]'`),
      "Telegram DM access warning",
    );
  });

  it("shows account-scoped config commands for named accounts", async () => {
    const note = await runFinalize(
      {
        channels: {
          telegram: {
            accounts: {
              alerts: {
                botToken: "tok",
              },
            },
          },
        },
      },
      "alerts",
    );

    expect(note).toHaveBeenCalledWith(
      expect.stringContaining(
        'openclaw config set channels.telegram.accounts.alerts.dmPolicy "allowlist"',
      ),
      "Telegram DM access warning",
    );
    expect(note).toHaveBeenCalledWith(
      expect.stringContaining(
        `openclaw config set channels.telegram.accounts.alerts.allowFrom '["YOUR_USER_ID"]'`,
      ),
      "Telegram DM access warning",
    );
  });

  it("skips the warning when an allowFrom entry already exists", async () => {
    const note = await runFinalize(
      {
        channels: {
          telegram: {
            botToken: "tok",
            allowFrom: ["123"],
          },
        },
      },
      DEFAULT_ACCOUNT_ID,
    );

    expect(note).not.toHaveBeenCalled();
  });
});
