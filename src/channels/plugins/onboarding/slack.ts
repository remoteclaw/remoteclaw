import type { RemoteClawConfig } from "../../../config/config.js";
import { DEFAULT_ACCOUNT_ID } from "../../../routing/session-key.js";
import {
  listSlackAccountIds,
  resolveDefaultSlackAccountId,
  resolveSlackAccount,
} from "../../../slack/accounts.js";
import {
  type SlackManifestConfig,
  buildSlackManifest,
  defaultManifestConfig,
} from "../../../slack/manifest.js";
import { resolveSlackChannelAllowlist } from "../../../slack/resolve-channels.js";
import { resolveSlackUserAllowlist } from "../../../slack/resolve-users.js";
import { formatDocsLink } from "../../../terminal/links.js";
import type { WizardPrompter } from "../../../wizard/prompts.js";
import type { ChannelOnboardingAdapter, ChannelOnboardingDmPolicy } from "../onboarding-types.js";
import { configureChannelAccessWithAllowlist } from "./channel-access-configure.js";
import {
  parseMentionOrPrefixedId,
  noteChannelLookupFailure,
  noteChannelLookupSummary,
  patchChannelConfigForAccount,
  promptLegacyChannelAllowFrom,
  resolveAccountIdForConfigure,
  resolveOnboardingAccountId,
  setAccountGroupPolicyForChannel,
  setLegacyChannelDmPolicyWithAllowFrom,
  setOnboardingChannelEnabled,
} from "./helpers.js";

const channel = "slack" as const;

async function promptManifestConfig(
  prompter: WizardPrompter,
  botName: string,
): Promise<SlackManifestConfig> {
  const transport = await prompter.select<"socket" | "http">({
    message: "Connection mode",
    options: [
      { value: "socket", label: "Socket Mode", hint: "recommended" },
      { value: "http", label: "HTTP Mode", hint: "requires public URL" },
    ],
    initialValue: "socket",
  });

  const includeSlashCommand = await prompter.confirm({
    message: "Include slash command?",
    initialValue: true,
  });

  let slashCommand: string | false = false;
  if (includeSlashCommand) {
    slashCommand = String(
      await prompter.text({
        message: "Slash command name",
        initialValue: defaultManifestConfig.slashCommand as string,
      }),
    ).trim();
  }

  const customIdentity = await prompter.confirm({
    message: "Include custom bot identity? (chat:write.customize)",
    initialValue: false,
  });

  const streaming = await prompter.confirm({
    message: "Include streaming support? (assistant:write)",
    initialValue: false,
  });

  return { botName, transport, slashCommand, customIdentity, streaming };
}

async function noteSlackTokenHelp(
  prompter: WizardPrompter,
  manifestConfig: SlackManifestConfig,
): Promise<void> {
  const manifest = buildSlackManifest(manifestConfig);
  const modeLabel = manifestConfig.transport === "socket" ? "socket mode" : "HTTP mode";
  const steps =
    manifestConfig.transport === "socket"
      ? [
          "1) Go to api.slack.com/apps → Create New App → From an app manifest",
          "2) Select your workspace",
          "3) Paste the manifest above → Create",
          "4) Socket Mode → Enable → Generate app-level token (xapp-...)",
          "5) Install App → Install to Workspace → copy bot token (xoxb-...)",
        ]
      : [
          "1) Go to api.slack.com/apps → Create New App → From an app manifest",
          "2) Select your workspace",
          "3) Paste the manifest above → Create",
          "4) Update the request URL to your public endpoint",
          "5) Install App → Install to Workspace → copy bot token (xoxb-...)",
        ];

  await prompter.note(
    [
      ...steps,
      "",
      "Tip: set SLACK_BOT_TOKEN + SLACK_APP_TOKEN in your env.",
      `Docs: ${formatDocsLink("/slack", "slack")}`,
      "",
      "Manifest (JSON):",
      manifest,
    ].join("\n"),
    `Slack ${modeLabel} tokens`,
  );
}

async function promptSlackTokens(prompter: WizardPrompter): Promise<{
  botToken: string;
  appToken: string;
}> {
  const botToken = String(
    await prompter.text({
      message: "Enter Slack bot token (xoxb-...)",
      validate: (value) => (value?.trim() ? undefined : "Required"),
    }),
  ).trim();
  const appToken = String(
    await prompter.text({
      message: "Enter Slack app token (xapp-...)",
      validate: (value) => (value?.trim() ? undefined : "Required"),
    }),
  ).trim();
  return { botToken, appToken };
}

function setSlackChannelAllowlist(
  cfg: RemoteClawConfig,
  accountId: string,
  channelKeys: string[],
): RemoteClawConfig {
  const channels = Object.fromEntries(channelKeys.map((key) => [key, { allow: true }]));
  return patchChannelConfigForAccount({
    cfg,
    channel: "slack",
    accountId,
    patch: { channels },
  });
}

async function promptSlackAllowFrom(params: {
  cfg: RemoteClawConfig;
  prompter: WizardPrompter;
  accountId?: string;
}): Promise<RemoteClawConfig> {
  const accountId = resolveOnboardingAccountId({
    accountId: params.accountId,
    defaultAccountId: resolveDefaultSlackAccountId(params.cfg),
  });
  const resolved = resolveSlackAccount({ cfg: params.cfg, accountId });
  const token = resolved.config.userToken ?? resolved.config.botToken ?? "";
  const existing =
    params.cfg.channels?.slack?.allowFrom ?? params.cfg.channels?.slack?.dm?.allowFrom ?? [];
  const parseId = (value: string) =>
    parseMentionOrPrefixedId({
      value,
      mentionPattern: /^<@([A-Z0-9]+)>$/i,
      prefixPattern: /^(slack:|user:)/i,
      idPattern: /^[A-Z][A-Z0-9]+$/i,
      normalizeId: (id) => id.toUpperCase(),
    });

  return promptLegacyChannelAllowFrom({
    cfg: params.cfg,
    channel: "slack",
    prompter: params.prompter,
    existing,
    token,
    noteTitle: "Slack allowlist",
    noteLines: [
      "Allowlist Slack DMs by username (we resolve to user ids).",
      "Examples:",
      "- U12345678",
      "- @alice",
      "Multiple entries: comma-separated.",
      `Docs: ${formatDocsLink("/slack", "slack")}`,
    ],
    message: "Slack allowFrom (usernames or ids)",
    placeholder: "@alice, U12345678",
    parseId,
    invalidWithoutTokenNote: "Slack token missing; use user ids (or mention form) only.",
    resolveEntries: ({ token, entries }) =>
      resolveSlackUserAllowlist({
        token,
        entries,
      }),
  });
}

const dmPolicy: ChannelOnboardingDmPolicy = {
  label: "Slack",
  channel,
  policyKey: "channels.slack.dmPolicy",
  allowFromKey: "channels.slack.allowFrom",
  getCurrent: (cfg) =>
    cfg.channels?.slack?.dmPolicy ?? cfg.channels?.slack?.dm?.policy ?? "pairing",
  setPolicy: (cfg, policy) =>
    setLegacyChannelDmPolicyWithAllowFrom({
      cfg,
      channel: "slack",
      dmPolicy: policy,
    }),
  promptAllowFrom: promptSlackAllowFrom,
};

export const slackOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg }) => {
    const configured = listSlackAccountIds(cfg).some((accountId) => {
      const account = resolveSlackAccount({ cfg, accountId });
      return Boolean(account.botToken && account.appToken);
    });
    return {
      channel,
      configured,
      statusLines: [`Slack: ${configured ? "configured" : "needs tokens"}`],
      selectionHint: configured ? "configured" : "needs tokens",
      quickstartScore: configured ? 2 : 1,
    };
  },
  configure: async ({ cfg, prompter, accountOverrides, shouldPromptAccountIds }) => {
    const defaultSlackAccountId = resolveDefaultSlackAccountId(cfg);
    const slackAccountId = await resolveAccountIdForConfigure({
      cfg,
      prompter,
      label: "Slack",
      accountOverride: accountOverrides.slack,
      shouldPromptAccountIds,
      listAccountIds: listSlackAccountIds,
      defaultAccountId: defaultSlackAccountId,
    });

    let next = cfg;
    const resolvedAccount = resolveSlackAccount({
      cfg: next,
      accountId: slackAccountId,
    });
    const accountConfigured = Boolean(resolvedAccount.botToken && resolvedAccount.appToken);
    const allowEnv = slackAccountId === DEFAULT_ACCOUNT_ID;
    const canUseEnv =
      allowEnv &&
      Boolean(process.env.SLACK_BOT_TOKEN?.trim()) &&
      Boolean(process.env.SLACK_APP_TOKEN?.trim());
    const hasConfigTokens = Boolean(
      resolvedAccount.config.botToken && resolvedAccount.config.appToken,
    );

    let botToken: string | null = null;
    let appToken: string | null = null;
    const slackBotName = String(
      await prompter.text({
        message: "Slack bot display name (used for manifest)",
        initialValue: "RemoteClaw",
      }),
    ).trim();
    const manifestConfig = await promptManifestConfig(prompter, slackBotName);
    if (!accountConfigured) {
      await noteSlackTokenHelp(prompter, manifestConfig);
    }
    if (canUseEnv && (!resolvedAccount.config.botToken || !resolvedAccount.config.appToken)) {
      const keepEnv = await prompter.confirm({
        message: "SLACK_BOT_TOKEN + SLACK_APP_TOKEN detected. Use env vars?",
        initialValue: true,
      });
      if (keepEnv) {
        next = patchChannelConfigForAccount({
          cfg: next,
          channel: "slack",
          accountId: slackAccountId,
          patch: {},
        });
      } else {
        ({ botToken, appToken } = await promptSlackTokens(prompter));
      }
    } else if (hasConfigTokens) {
      const keep = await prompter.confirm({
        message: "Slack tokens already configured. Keep them?",
        initialValue: true,
      });
      if (!keep) {
        ({ botToken, appToken } = await promptSlackTokens(prompter));
      }
    } else {
      ({ botToken, appToken } = await promptSlackTokens(prompter));
    }

    if (botToken && appToken) {
      next = patchChannelConfigForAccount({
        cfg: next,
        channel: "slack",
        accountId: slackAccountId,
        patch: { botToken, appToken },
      });
    }

    next = await configureChannelAccessWithAllowlist({
      cfg: next,
      prompter,
      label: "Slack channels",
      currentPolicy: resolvedAccount.config.groupPolicy ?? "allowlist",
      currentEntries: Object.entries(resolvedAccount.config.channels ?? {})
        .filter(([, value]) => value?.allow !== false && value?.enabled !== false)
        .map(([key]) => key),
      placeholder: "#general, #private, C123",
      updatePrompt: Boolean(resolvedAccount.config.channels),
      setPolicy: (cfg, policy) =>
        setAccountGroupPolicyForChannel({
          cfg,
          channel: "slack",
          accountId: slackAccountId,
          groupPolicy: policy,
        }),
      resolveAllowlist: async ({ cfg, entries }) => {
        let keys = entries;
        const accountWithTokens = resolveSlackAccount({
          cfg,
          accountId: slackAccountId,
        });
        if (accountWithTokens.botToken && entries.length > 0) {
          try {
            const resolved = await resolveSlackChannelAllowlist({
              token: accountWithTokens.botToken,
              entries,
            });
            const resolvedKeys = resolved
              .filter((entry) => entry.resolved && entry.id)
              .map((entry) => entry.id as string);
            const unresolved = resolved
              .filter((entry) => !entry.resolved)
              .map((entry) => entry.input);
            keys = [...resolvedKeys, ...unresolved.map((entry) => entry.trim()).filter(Boolean)];
            await noteChannelLookupSummary({
              prompter,
              label: "Slack channels",
              resolvedSections: [{ title: "Resolved", values: resolvedKeys }],
              unresolved,
            });
          } catch (err) {
            await noteChannelLookupFailure({
              prompter,
              label: "Slack channels",
              error: err,
            });
          }
        }
        return keys;
      },
      applyAllowlist: ({ cfg, resolved }) => {
        return setSlackChannelAllowlist(cfg, slackAccountId, resolved);
      },
    });

    return { cfg: next, accountId: slackAccountId };
  },
  dmPolicy,
  disable: (cfg) => setOnboardingChannelEnabled(cfg, channel, false),
};
