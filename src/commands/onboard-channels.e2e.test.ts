import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import { createEmptyPluginRegistry } from "../plugins/registry.js";
import { setActivePluginRegistry } from "../plugins/runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import {
  ensureChannelSetupPluginInstalled,
  loadChannelSetupPluginRegistrySnapshotForChannel,
  reloadChannelSetupPluginRegistry,
} from "./channel-setup/plugin-install.js";
import {
  patchChannelSetupWizardAdapter,
  setDefaultChannelPluginRegistryForTests,
} from "./channel-test-helpers.js";
import { setupChannels } from "./onboard-channels.js";
import { createExitThrowingRuntime, createWizardPrompter } from "./test-wizard-helpers.js";

function createPrompter(overrides: Partial<WizardPrompter>): WizardPrompter {
  return createWizardPrompter(
    {
      progress: vi.fn(() => ({ update: vi.fn(), stop: vi.fn() })),
      ...overrides,
    },
    { defaultSelect: "__done__" },
  );
}

function createUnexpectedPromptGuards() {
  return {
    multiselect: vi.fn(async () => {
      throw new Error("unexpected multiselect");
    }),
    text: vi.fn(async ({ message }: { message: string }) => {
      throw new Error(`unexpected text prompt: ${message}`);
    }) as unknown as WizardPrompter["text"],
  };
}

type SetupChannelsOptions = Parameters<typeof setupChannels>[3];

function runSetupChannels(
  cfg: RemoteClawConfig,
  prompter: WizardPrompter,
  options?: SetupChannelsOptions,
) {
  return setupChannels(cfg, createExitThrowingRuntime(), prompter, {
    skipConfirm: true,
    ...options,
  });
}

function createQuickstartTelegramSelect(options?: {
  configuredAction?: "skip";
  strictUnexpected?: boolean;
}) {
  return vi.fn(async ({ message }: { message: string }) => {
    if (message === "Select channel (QuickStart)") {
      return "telegram";
    }
    if (options?.configuredAction && message.includes("already configured")) {
      return options.configuredAction;
    }
    if (options?.strictUnexpected) {
      throw new Error(`unexpected select prompt: ${message}`);
    }
    return "__done__";
  });
}

function createUnexpectedQuickstartPrompter(select: WizardPrompter["select"]) {
  const { multiselect, text } = createUnexpectedPromptGuards();
  return {
    prompter: createPrompter({ select, multiselect, text }),
    multiselect,
    text,
  };
}

function createTelegramCfg(botToken: string, enabled?: boolean): RemoteClawConfig {
  return {
    channels: {
      telegram: {
        botToken,
        ...(typeof enabled === "boolean" ? { enabled } : {}),
      },
    },
  } as RemoteClawConfig;
}

function patchTelegramAdapter(overrides: Parameters<typeof patchChannelSetupWizardAdapter>[1]) {
  return patchChannelSetupWizardAdapter("telegram", {
    ...overrides,
    getStatus:
      overrides.getStatus ??
      vi.fn(async ({ cfg }: { cfg: RemoteClawConfig }) => ({
        channel: "telegram",
        configured: Boolean(cfg.channels?.telegram?.botToken),
        statusLines: [],
      })),
  });
}

function createUnexpectedConfigureCall(message: string) {
  return vi.fn(async () => {
    throw new Error(message);
  });
}

async function runConfiguredTelegramSetup(params: {
  strictUnexpected?: boolean;
  configureWhenConfigured: NonNullable<
    Parameters<typeof patchTelegramAdapter>[0]["configureWhenConfigured"]
  >;
  configureErrorMessage: string;
}) {
  const select = createQuickstartTelegramSelect({ strictUnexpected: params.strictUnexpected });
  const selection = vi.fn();
  const onAccountId = vi.fn();
  const configure = createUnexpectedConfigureCall(params.configureErrorMessage);
  const restore = patchTelegramAdapter({
    configureInteractive: undefined,
    configureWhenConfigured: params.configureWhenConfigured,
    configure,
  });
  const { prompter } = createUnexpectedQuickstartPrompter(
    select as unknown as WizardPrompter["select"],
  );

  try {
    const cfg = await runSetupChannels(createTelegramCfg("old-token"), prompter, {
      quickstartDefaults: true,
      onSelection: selection,
      onAccountId,
    });
    return { cfg, selection, onAccountId, configure };
  } finally {
    restore();
  }
}

async function runQuickstartTelegramSetupWithInteractive(params: {
  configureInteractive: NonNullable<
    Parameters<typeof patchTelegramAdapter>[0]["configureInteractive"]
  >;
  configure?: NonNullable<Parameters<typeof patchTelegramAdapter>[0]["configure"]>;
}) {
  const select = createQuickstartTelegramSelect();
  const selection = vi.fn();
  const onAccountId = vi.fn();
  const restore = patchTelegramAdapter({
    configureInteractive: params.configureInteractive,
    ...(params.configure ? { configure: params.configure } : {}),
  });
  const { prompter } = createUnexpectedQuickstartPrompter(
    select as unknown as WizardPrompter["select"],
  );

  try {
    const cfg = await runSetupChannels({} as RemoteClawConfig, prompter, {
      quickstartDefaults: true,
      onSelection: selection,
      onAccountId,
    });
    return { cfg, selection, onAccountId };
  } finally {
    restore();
  }
}

vi.mock("node:fs/promises", () => ({
  default: {
    access: vi.fn(async () => {
      throw new Error("ENOENT");
    }),
  },
}));

vi.mock("../channel-web.js", () => ({
  loginWeb: vi.fn(async () => {}),
}));

vi.mock("./onboard-helpers.js", () => ({
  detectBinary: vi.fn(async () => false),
}));

vi.mock("./channel-setup/plugin-install.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as Record<string, unknown>),
    ensureChannelSetupPluginInstalled: vi.fn(async ({ cfg }: { cfg: RemoteClawConfig }) => ({
      cfg,
      installed: true,
    })),
    // Allow tests to simulate an empty plugin registry during setup.
    loadChannelSetupPluginRegistrySnapshotForChannel: vi.fn(() => createEmptyPluginRegistry()),
    reloadChannelSetupPluginRegistry: vi.fn(() => {}),
  };
});

describe("setupChannels", () => {
  beforeEach(() => {
    setDefaultChannelPluginRegistryForTests();
    catalogMocks.listChannelPluginCatalogEntries.mockReset();
    manifestRegistryMocks.loadPluginManifestRegistry.mockReset();
    manifestRegistryMocks.loadPluginManifestRegistry.mockReturnValue({
      plugins: [],
      diagnostics: [],
    });
    vi.mocked(ensureChannelSetupPluginInstalled).mockClear();
    vi.mocked(ensureChannelSetupPluginInstalled).mockImplementation(async ({ cfg }) => ({
      cfg,
      installed: true,
    }));
    vi.mocked(loadChannelSetupPluginRegistrySnapshotForChannel).mockClear();
    vi.mocked(reloadChannelSetupPluginRegistry).mockClear();
  });
  it("QuickStart uses single-select (no multiselect) and doesn't prompt for Telegram token when WhatsApp is chosen", async () => {
    const select = vi.fn(async () => "whatsapp");
    const multiselect = vi.fn(async () => {
      throw new Error("unexpected multiselect");
    });
    const text = vi.fn(async ({ message }: { message: string }) => {
      if (message.includes("Enter Telegram bot token")) {
        throw new Error("unexpected Telegram token prompt");
      }
      if (message.includes("Your personal WhatsApp number")) {
        return "+15555550123";
      }
      throw new Error(`unexpected text prompt: ${message}`);
    });

    const prompter = createPrompter({
      select: select as unknown as WizardPrompter["select"],
      multiselect,
      text: text as unknown as WizardPrompter["text"],
    });

    const runtime = createExitThrowingRuntime();

    await setupChannels(
      { agents: { list: [{ id: "main", workspace: "/tmp/test-workspace" }] } } as RemoteClawConfig,
      runtime,
      prompter,
      {
        skipConfirm: true,
        quickstartDefaults: true,
        forceAllowFromChannels: ["whatsapp"],
      },
    );

    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Select channel (QuickStart)" }),
    );
    expect(multiselect).not.toHaveBeenCalled();
  });

  it("continues Telegram onboarding even when plugin registry is empty (avoids 'plugin not available' block)", async () => {
    // Simulate missing registry entries (the scenario reported in #25545).
    setActivePluginRegistry(createEmptyPluginRegistry());
    // Avoid accidental env-token configuration changing the prompt path.
    process.env.TELEGRAM_BOT_TOKEN = "";

    const note = vi.fn(async (_message?: string, _title?: string) => {});
    const select = vi.fn(async ({ message }: { message: string }) => {
      if (message === "Select channel (QuickStart)") {
        return "telegram";
      }
      return "__done__";
    });
    const text = vi.fn(async () => "123:token");

    const prompter = createPrompter({
      note,
      select: select as unknown as WizardPrompter["select"],
      text: text as unknown as WizardPrompter["text"],
    });

    const runtime = createExitThrowingRuntime();

    await setupChannels(
      { agents: { list: [{ id: "main", workspace: "/tmp/test-workspace" }] } } as RemoteClawConfig,
      runtime,
      prompter,
      {
        skipConfirm: true,
        quickstartDefaults: true,
      },
    );

    // The new flow should not stop setup with a hard "plugin not available" note.
    const sawHardStop = note.mock.calls.some((call) => {
      const message = call[0];
      const title = call[1];
      return (
        title === "Channel setup" && String(message).trim() === "telegram plugin not available."
      );
    });
    expect(sawHardStop).toBe(false);
    expect(loadChannelSetupPluginRegistrySnapshotForChannel).not.toHaveBeenCalled();
    expect(reloadChannelSetupPluginRegistry).not.toHaveBeenCalled();
  });

  it("shows explicit dmScope config command in channel primer", async () => {
    const note = vi.fn(async (_message?: string, _title?: string) => {});
    const select = vi.fn(async () => "__done__");
    const { multiselect, text } = createUnexpectedPromptGuards();

    const prompter = createPrompter({
      note,
      select: select as unknown as WizardPrompter["select"],
      multiselect,
      text,
    });

    const runtime = createExitThrowingRuntime();

    await setupChannels(
      { agents: { list: [{ id: "main", workspace: "/tmp/test-workspace" }] } } as RemoteClawConfig,
      runtime,
      prompter,
      {
        skipConfirm: true,
      },
    );

    const sawPrimer = note.mock.calls.some(
      ([message, title]) =>
        title === "How channels work" &&
        String(message).includes('config set session.dmScope "per-channel-peer"'),
    );
    expect(sawPrimer).toBe(true);
    expect(multiselect).not.toHaveBeenCalled();
  });

  it("keeps configured external plugin channels visible when the active registry starts empty", async () => {
    setActivePluginRegistry(createEmptyPluginRegistry());
    catalogMocks.listChannelPluginCatalogEntries.mockReturnValue([
      {
        id: "msteams",
        pluginId: "@openclaw/msteams-plugin",
        meta: {
          id: "msteams",
          label: "Microsoft Teams",
          selectionLabel: "Microsoft Teams",
          docsPath: "/channels/msteams",
          blurb: "teams channel",
        },
        install: {
          npmSpec: "@openclaw/msteams",
        },
      } satisfies ChannelPluginCatalogEntry,
    ]);
    vi.mocked(loadChannelSetupPluginRegistrySnapshotForChannel).mockImplementation(
      ({ channel }: { channel: string }) => {
        const registry = createEmptyPluginRegistry();
        if (channel === "msteams") {
          registry.channels.push({
            pluginId: "@openclaw/msteams-plugin",
            source: "test",
            plugin: {
              id: "msteams",
              meta: {
                id: "msteams",
                label: "Microsoft Teams",
                selectionLabel: "Microsoft Teams",
                docsPath: "/channels/msteams",
                blurb: "teams channel",
              },
              capabilities: { chatTypes: ["direct"] },
              config: {
                listAccountIds: () => [],
                resolveAccount: () => ({ accountId: "default" }),
              },
              outbound: { deliveryMode: "direct" },
            },
          } as never);
        }
        return registry;
      },
    );
    const select = vi.fn(async ({ message, options }: { message: string; options: unknown[] }) => {
      if (message === "Select a channel") {
        const entries = options as Array<{ value: string; hint?: string }>;
        const msteams = entries.find((entry) => entry.value === "msteams");
        expect(msteams).toBeDefined();
        expect(msteams?.hint ?? "").not.toContain("plugin");
        expect(msteams?.hint ?? "").not.toContain("install");
        return "__done__";
      }
      return "__done__";
    });
    const { multiselect, text } = createUnexpectedPromptGuards();
    const prompter = createPrompter({
      select: select as unknown as WizardPrompter["select"],
      multiselect,
      text,
    });

    await runSetupChannels(
      {
        channels: {
          msteams: {
            tenantId: "tenant-1",
          },
        },
        plugins: {
          entries: {
            "@openclaw/msteams-plugin": { enabled: true },
          },
        },
      } as RemoteClawConfig,
      prompter,
    );

    expect(loadChannelSetupPluginRegistrySnapshotForChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "msteams",
        pluginId: "@openclaw/msteams-plugin",
      }),
    );
    expect(multiselect).not.toHaveBeenCalled();
  });

  it("treats installed external plugin channels as installed without reinstall prompts", async () => {
    setActivePluginRegistry(createEmptyPluginRegistry());
    catalogMocks.listChannelPluginCatalogEntries.mockReturnValue([
      {
        id: "msteams",
        pluginId: "@openclaw/msteams-plugin",
        meta: {
          id: "msteams",
          label: "Microsoft Teams",
          selectionLabel: "Microsoft Teams",
          docsPath: "/channels/msteams",
          blurb: "teams channel",
        },
        install: {
          npmSpec: "@openclaw/msteams",
        },
      } satisfies ChannelPluginCatalogEntry,
    ]);
    manifestRegistryMocks.loadPluginManifestRegistry.mockReturnValue({
      plugins: [
        {
          id: "@openclaw/msteams-plugin",
          channels: ["msteams"],
        } as never,
      ],
      diagnostics: [],
    });
    vi.mocked(loadChannelSetupPluginRegistrySnapshotForChannel).mockImplementation(
      ({ channel }: { channel: string }) => {
        const registry = createEmptyPluginRegistry();
        if (channel === "msteams") {
          registry.channelSetups.push({
            pluginId: "@openclaw/msteams-plugin",
            source: "test",
            plugin: {
              id: "msteams",
              meta: {
                id: "msteams",
                label: "Microsoft Teams",
                selectionLabel: "Microsoft Teams",
                docsPath: "/channels/msteams",
                blurb: "teams channel",
              },
              capabilities: { chatTypes: ["direct"] },
              config: {
                listAccountIds: () => [],
                resolveAccount: () => ({ accountId: "default" }),
              },
              setupWizard: {
                channel: "msteams",
                status: {
                  configuredLabel: "configured",
                  unconfiguredLabel: "installed",
                  resolveConfigured: () => false,
                  resolveStatusLines: async () => [],
                  resolveSelectionHint: async () => "installed",
                },
                credentials: [],
              },
              outbound: { deliveryMode: "direct" },
            },
          } as never);
        }
        return registry;
      },
    );

    let channelSelectionCount = 0;
    const select = vi.fn(async ({ message }: { message: string }) => {
      if (message === "Select a channel") {
        channelSelectionCount += 1;
        return channelSelectionCount === 1 ? "msteams" : "__done__";
      }
      return "__done__";
    });
    const { multiselect, text } = createUnexpectedPromptGuards();
    const prompter = createPrompter({
      select: select as unknown as WizardPrompter["select"],
      multiselect,
      text,
    });

    await runSetupChannels({} as RemoteClawConfig, prompter);

    expect(ensureChannelSetupPluginInstalled).not.toHaveBeenCalled();
    expect(loadChannelSetupPluginRegistrySnapshotForChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "msteams",
        pluginId: "@openclaw/msteams-plugin",
      }),
    );
    expect(multiselect).not.toHaveBeenCalled();
  });

  it("uses scoped plugin accounts when disabling a configured external channel", async () => {
    setActivePluginRegistry(createEmptyPluginRegistry());
    const setAccountEnabled = vi.fn(
      ({
        cfg,
        accountId,
        enabled,
      }: {
        cfg: RemoteClawConfig;
        accountId: string;
        enabled: boolean;
      }) => ({
        ...cfg,
        channels: {
          ...cfg.channels,
          msteams: {
            ...(cfg.channels?.msteams as Record<string, unknown> | undefined),
            accounts: {
              ...(cfg.channels?.msteams as { accounts?: Record<string, unknown> } | undefined)
                ?.accounts,
              [accountId]: {
                ...(
                  cfg.channels?.msteams as
                    | {
                        accounts?: Record<string, Record<string, unknown>>;
                      }
                    | undefined
                )?.accounts?.[accountId],
                enabled,
              },
            },
          },
        },
      }),
    );
    vi.mocked(loadChannelSetupPluginRegistrySnapshotForChannel).mockImplementation(
      ({ channel }: { channel: string }) => {
        const registry = createEmptyPluginRegistry();
        if (channel === "msteams") {
          registry.channels.push({
            pluginId: "msteams",
            source: "test",
            plugin: {
              id: "msteams",
              meta: {
                id: "msteams",
                label: "Microsoft Teams",
                selectionLabel: "Microsoft Teams",
                docsPath: "/channels/msteams",
                blurb: "teams channel",
              },
              capabilities: { chatTypes: ["direct"] },
              config: {
                listAccountIds: (cfg: RemoteClawConfig) =>
                  Object.keys(
                    (cfg.channels?.msteams as { accounts?: Record<string, unknown> } | undefined)
                      ?.accounts ?? {},
                  ),
                resolveAccount: (cfg: RemoteClawConfig, accountId: string) =>
                  (
                    cfg.channels?.msteams as
                      | {
                          accounts?: Record<string, Record<string, unknown>>;
                        }
                      | undefined
                  )?.accounts?.[accountId] ?? { accountId },
                setAccountEnabled,
              },
              setupWizard: {
                channel: "msteams",
                status: {
                  configuredLabel: "configured",
                  unconfiguredLabel: "needs setup",
                  resolveConfigured: ({ cfg }: { cfg: RemoteClawConfig }) =>
                    Boolean((cfg.channels?.msteams as { tenantId?: string } | undefined)?.tenantId),
                  resolveStatusLines: async () => [],
                  resolveSelectionHint: async () => "configured",
                },
                credentials: [],
              },
              outbound: { deliveryMode: "direct" },
            },
          } as never);
        }
        return registry;
      },
    );

    let channelSelectionCount = 0;
    const select = vi.fn(async ({ message, options }: { message: string; options: unknown[] }) => {
      if (message === "Select a channel") {
        channelSelectionCount += 1;
        return channelSelectionCount === 1 ? "msteams" : "__done__";
      }
      if (message.includes("already configured")) {
        return "skip";
      }
      throw new Error(`unexpected select prompt: ${message}`);
    });
    const { multiselect, text } = createUnexpectedPromptGuards();

    const prompter = createPrompter({
      select: select as unknown as WizardPrompter["select"],
      multiselect,
      text,
    });

    const runtime = createExitThrowingRuntime();

    await setupChannels(
      {
        agents: { list: [{ id: "main", workspace: "/tmp/test-workspace" }] },
        channels: {
          telegram: {
            botToken: "token",
          },
        },
      } as RemoteClawConfig,
      runtime,
      prompter,
      {
        skipConfirm: true,
        quickstartDefaults: true,
      },
    );

    expect(loadChannelSetupPluginRegistrySnapshotForChannel).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "msteams" }),
    );
    expect(setAccountEnabled).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "work", enabled: false }),
    );
    expect(
      (
        next.channels?.msteams as
          | {
              accounts?: Record<string, { enabled?: boolean }>;
            }
          | undefined
      )?.accounts?.work?.enabled,
    ).toBe(false);
    expect(multiselect).not.toHaveBeenCalled();
  });

  it("prompts for configured channel action and skips configuration when told to skip", async () => {
    const select = createQuickstartTelegramSelect({
      configuredAction: "skip",
      strictUnexpected: true,
    });
    const { prompter, multiselect, text } = createUnexpectedQuickstartPrompter(
      select as unknown as WizardPrompter["select"],
    );

    await runSetupChannels(createTelegramCfg("token"), prompter, {
      quickstartDefaults: true,
    });

    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Select channel (QuickStart)" }),
    );
    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("already configured") }),
    );
    expect(multiselect).not.toHaveBeenCalled();
    expect(text).not.toHaveBeenCalled();
  });

  it("adds disabled hint to channel selection when a channel is disabled", async () => {
    let selectionCount = 0;
    const select = vi.fn(async ({ message }: { message: string; options: unknown[] }) => {
      if (message === "Select a channel") {
        selectionCount += 1;
        return selectionCount === 1 ? "telegram" : "__done__";
      }
      if (message.includes("already configured")) {
        return "skip";
      }
      return "__done__";
    });
    const multiselect = vi.fn(async () => {
      throw new Error("unexpected multiselect");
    });
    const prompter = createPrompter({
      select: select as unknown as WizardPrompter["select"],
      multiselect,
      text: vi.fn(async () => "") as unknown as WizardPrompter["text"],
    });

    const runtime = createExitThrowingRuntime();

    await setupChannels(
      {
        agents: { list: [{ id: "main", workspace: "/tmp/test-workspace" }] },
        channels: {
          telegram: {
            botToken: "token",
            enabled: false,
          },
        },
      } as RemoteClawConfig,
      runtime,
      prompter,
      {
        skipConfirm: true,
      },
    );

    expect(select).toHaveBeenCalledWith(expect.objectContaining({ message: "Select a channel" }));
    const channelSelectCall = select.mock.calls.find(
      ([params]) => (params as { message?: string }).message === "Select a channel",
    );
    const telegramOption = (
      channelSelectCall?.[0] as { options?: Array<{ value: string; hint?: string }> } | undefined
    )?.options?.find((opt) => opt.value === "telegram");
    expect(telegramOption?.hint).toContain("disabled");
    expect(multiselect).not.toHaveBeenCalled();
  });

  it("uses configureInteractive skip without mutating selection/account state", async () => {
    const select = vi.fn(async ({ message }: { message: string }) => {
      if (message === "Select channel (QuickStart)") {
        return "telegram";
      }
      return "__done__";
    });
    const selection = vi.fn();
    const onAccountId = vi.fn();
    const configureInteractive = vi.fn(async () => "skip" as const);
    const restore = patchChannelOnboardingAdapter("telegram", {
      getStatus: vi.fn(async ({ cfg }) => ({
        channel: "telegram",
        configured: Boolean(cfg.channels?.telegram?.botToken),
        statusLines: [],
      })),
      configureInteractive,
    });
    const { multiselect, text } = createUnexpectedPromptGuards();

    const prompter = createPrompter({
      select: select as unknown as WizardPrompter["select"],
      multiselect,
      text,
    });

    const runtime = createExitThrowingRuntime();
    try {
      const cfg = await setupChannels(
        {
          agents: { list: [{ id: "main", workspace: "/tmp/test-workspace" }] },
        } as RemoteClawConfig,
        runtime,
        prompter,
        {
          skipConfirm: true,
          quickstartDefaults: true,
          onSelection: selection,
          onAccountId,
        },
      );

      expect(configureInteractive).toHaveBeenCalledWith(
        expect.objectContaining({ configured: false, label: expect.any(String) }),
      );
      expect(selection).toHaveBeenCalledWith([]);
      expect(onAccountId).not.toHaveBeenCalled();
      expect(cfg.channels?.telegram?.botToken).toBeUndefined();
    } finally {
      restore();
    }
  });

  it("applies configureInteractive result cfg/account updates", async () => {
    const select = vi.fn(async ({ message }: { message: string }) => {
      if (message === "Select channel (QuickStart)") {
        return "telegram";
      }
      return "__done__";
    });
    const selection = vi.fn();
    const onAccountId = vi.fn();
    const configureInteractive = vi.fn(async ({ cfg }: { cfg: RemoteClawConfig }) => ({
      cfg: {
        ...cfg,
        channels: {
          ...cfg.channels,
          telegram: { ...cfg.channels?.telegram, botToken: "new-token" },
        },
      } as RemoteClawConfig,
      accountId: "acct-1",
    }));
    const configure = vi.fn(async () => {
      throw new Error("configure should not be called when configureInteractive is present");
    });
    const restore = patchChannelOnboardingAdapter("telegram", {
      getStatus: vi.fn(async ({ cfg }) => ({
        channel: "telegram",
        configured: Boolean(cfg.channels?.telegram?.botToken),
        statusLines: [],
      })),
      configureInteractive,
      configure,
    });
    const { multiselect, text } = createUnexpectedPromptGuards();

    const prompter = createPrompter({
      select: select as unknown as WizardPrompter["select"],
      multiselect,
      text,
    });

    const runtime = createExitThrowingRuntime();
    try {
      const cfg = await setupChannels(
        {
          agents: { list: [{ id: "main", workspace: "/tmp/test-workspace" }] },
        } as RemoteClawConfig,
        runtime,
        prompter,
        {
          skipConfirm: true,
          quickstartDefaults: true,
          onSelection: selection,
          onAccountId,
        },
      );

      expect(configureInteractive).toHaveBeenCalledTimes(1);
      expect(configure).not.toHaveBeenCalled();
      expect(selection).toHaveBeenCalledWith(["telegram"]);
      expect(onAccountId).toHaveBeenCalledWith("telegram", "acct-1");
      expect(cfg.channels?.telegram?.botToken).toBe("new-token");
    } finally {
      restore();
    }
  });

  it("uses configureWhenConfigured when channel is already configured", async () => {
    const select = vi.fn(async ({ message }: { message: string }) => {
      if (message === "Select channel (QuickStart)") {
        return "telegram";
      }
      return "__done__";
    });
    const selection = vi.fn();
    const onAccountId = vi.fn();
    const configureWhenConfigured = vi.fn(async ({ cfg }: { cfg: RemoteClawConfig }) => ({
      cfg: {
        ...cfg,
        channels: {
          ...cfg.channels,
          telegram: { ...cfg.channels?.telegram, botToken: "updated-token" },
        },
      } as RemoteClawConfig,
      accountId: "acct-2",
    }));
    const configure = vi.fn(async () => {
      throw new Error(
        "configure should not be called when configureWhenConfigured handles updates",
      );
    });
    const restore = patchChannelOnboardingAdapter("telegram", {
      getStatus: vi.fn(async ({ cfg }) => ({
        channel: "telegram",
        configured: Boolean(cfg.channels?.telegram?.botToken),
        statusLines: [],
      })),
      configureInteractive: undefined,
      configureWhenConfigured,
      configure,
    });
    const { multiselect, text } = createUnexpectedPromptGuards();

    const prompter = createPrompter({
      select: select as unknown as WizardPrompter["select"],
      multiselect,
      text,
    });

    const runtime = createExitThrowingRuntime();
    try {
      const cfg = await setupChannels(
        {
          agents: { list: [{ id: "main", workspace: "/tmp/test-workspace" }] },
          channels: {
            telegram: {
              botToken: "old-token",
            },
          },
        } as RemoteClawConfig,
        runtime,
        prompter,
        {
          skipConfirm: true,
          quickstartDefaults: true,
          onSelection: selection,
          onAccountId,
        },
      );

      expect(configureWhenConfigured).toHaveBeenCalledTimes(1);
      expect(configureWhenConfigured).toHaveBeenCalledWith(
        expect.objectContaining({ configured: true, label: expect.any(String) }),
      );
      expect(configure).not.toHaveBeenCalled();
      expect(selection).toHaveBeenCalledWith(["telegram"]);
      expect(onAccountId).toHaveBeenCalledWith("telegram", "acct-2");
      expect(cfg.channels?.telegram?.botToken).toBe("updated-token");
    } finally {
      restore();
    }
  });

  it("respects configureWhenConfigured skip without mutating selection or account state", async () => {
    const select = vi.fn(async ({ message }: { message: string }) => {
      if (message === "Select channel (QuickStart)") {
        return "telegram";
      }
      throw new Error(`unexpected select prompt: ${message}`);
    });
    const selection = vi.fn();
    const onAccountId = vi.fn();
    const configureWhenConfigured = vi.fn(async () => "skip" as const);
    const configure = vi.fn(async () => {
      throw new Error("configure should not run when configureWhenConfigured handles skip");
    });
    const restore = patchChannelOnboardingAdapter("telegram", {
      getStatus: vi.fn(async ({ cfg }) => ({
        channel: "telegram",
        configured: Boolean(cfg.channels?.telegram?.botToken),
        statusLines: [],
      })),
      configureInteractive: undefined,
      configureWhenConfigured,
      configure,
    });
    const { multiselect, text } = createUnexpectedPromptGuards();

    const prompter = createPrompter({
      select: select as unknown as WizardPrompter["select"],
      multiselect,
      text,
    });

    const runtime = createExitThrowingRuntime();
    try {
      const cfg = await setupChannels(
        {
          agents: { list: [{ id: "main", workspace: "/tmp/test-workspace" }] },
          channels: {
            telegram: {
              botToken: "old-token",
            },
          },
        } as RemoteClawConfig,
        runtime,
        prompter,
        {
          skipConfirm: true,
          quickstartDefaults: true,
          onSelection: selection,
          onAccountId,
        },
      );

      expect(configureWhenConfigured).toHaveBeenCalledWith(
        expect.objectContaining({ configured: true, label: expect.any(String) }),
      );
      expect(configure).not.toHaveBeenCalled();
      expect(selection).toHaveBeenCalledWith([]);
      expect(onAccountId).not.toHaveBeenCalled();
      expect(cfg.channels?.telegram?.botToken).toBe("old-token");
    } finally {
      restore();
    }
  });

  it("prefers configureInteractive over configureWhenConfigured when both hooks exist", async () => {
    const select = vi.fn(async ({ message }: { message: string }) => {
      if (message === "Select channel (QuickStart)") {
        return "telegram";
      }
      throw new Error(`unexpected select prompt: ${message}`);
    });
    const selection = vi.fn();
    const onAccountId = vi.fn();
    const configureInteractive = vi.fn(async () => "skip" as const);
    const configureWhenConfigured = vi.fn(async () => {
      throw new Error("configureWhenConfigured should not run when configureInteractive exists");
    });
    const restore = patchChannelOnboardingAdapter("telegram", {
      getStatus: vi.fn(async ({ cfg }) => ({
        channel: "telegram",
        configured: Boolean(cfg.channels?.telegram?.botToken),
        statusLines: [],
      })),
      configureInteractive,
      configureWhenConfigured,
    });
    const { multiselect, text } = createUnexpectedPromptGuards();

    const prompter = createPrompter({
      select: select as unknown as WizardPrompter["select"],
      multiselect,
      text,
    });

    const runtime = createExitThrowingRuntime();
    try {
      await setupChannels(
        {
          agents: { list: [{ id: "main", workspace: "/tmp/test-workspace" }] },
          channels: {
            telegram: {
              botToken: "old-token",
            },
          },
        } as RemoteClawConfig,
        runtime,
        prompter,
        {
          skipConfirm: true,
          quickstartDefaults: true,
          onSelection: selection,
          onAccountId,
        },
      );

      expect(configureInteractive).toHaveBeenCalledWith(
        expect.objectContaining({ configured: true, label: expect.any(String) }),
      );
      expect(configureWhenConfigured).not.toHaveBeenCalled();
      expect(selection).toHaveBeenCalledWith([]);
      expect(onAccountId).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });
});
